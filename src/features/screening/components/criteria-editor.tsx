"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type CriteriaError, saveCriteriaAction } from "../criteria-actions";
import { MAX_CHOICES } from "../criteria";
import {
  AGE_EXCEPTIONS,
  checkCriterionText,
  type ChoicesConfig,
  type Criterion,
  type DropdownConfig,
  type RangeConfig,
  type Settings,
  weightsFor,
} from "../domain";
import { BASIC_PRESETS, SPECIALIST_EXAMPLES } from "../presets";
import type { CriteriaSetup } from "../queries";

type Common = {
  key: string;
  id?: string;
  label: string;
  required: boolean;
  weight: number;
  legalException: string | null;
};
type BasicDraft = Common & { type: "basic"; source: "form" | "resume" } & (
    | { kind: "choices"; config: ChoicesConfig }
    | { kind: "dropdown"; config: DropdownConfig }
    | { kind: "range"; config: RangeConfig }
  );
type SpecialistDraft = Common & { type: "specialist" };
type Draft = BasicDraft | SpecialistDraft;

const newKey = () => crypto.randomUUID();

const DEFAULT_CONFIG = {
  choices: { options: ["", ""], pass: [] } as ChoicesConfig,
  dropdown: { options: ["", ""], line: "", dir: "upto" } as DropdownConfig,
  range: { min: null, max: null, unit: "" } as RangeConfig,
};

function toDraft(c: Criterion & { legalException: string | null }): Draft {
  return { ...c, key: c.id, id: c.id } as Draft;
}

/** The job's screening setup (docs/01 §5.5 criteria editor, docs/02 M4-2 – M4-6, M4-10). */
export function CriteriaEditor({
  orgSlug,
  clientSlug,
  setup,
  canEdit,
}: {
  orgSlug: string;
  clientSlug: string;
  setup: CriteriaSetup;
  canEdit: boolean;
}) {
  const t = useTranslations("Criteria");
  const [settings, setSettings] = useState<Settings>(setup.settings);
  const [drafts, setDrafts] = useState<Draft[]>(() => setup.criteria.map(toDraft));
  const [errors, setErrors] = useState<CriteriaError[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  const changeSettings = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  const update = (key: string, patch: Partial<Draft>) => {
    setDrafts((list) => list.map((d) => (d.key === key ? ({ ...d, ...patch } as Draft) : d)));
    setDirty(true);
  };
  const add = (draft: Draft) => {
    setDrafts((list) => [...list, draft]);
    setDirty(true);
  };
  const remove = (key: string) => {
    setDrafts((list) => list.filter((d) => d.key !== key));
    setDirty(true);
  };
  const move = (key: string, by: -1 | 1) => {
    setDrafts((list) => {
      const index = list.findIndex((d) => d.key === key);
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setDirty(true);
  };

  const weights = weightsFor(
    drafts.map((d) => ({ ...d, id: d.key }) as Criterion),
    settings.weightMode,
  );
  const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
  const errorFor = (key: string) => {
    const index = drafts.findIndex((d) => d.key === key);
    return errors.find((e) => e.index === index);
  };

  function save() {
    startSaving(async () => {
      const result = await saveCriteriaAction(orgSlug, clientSlug, setup.jobId, {
        settings,
        criteria: drafts.map((d) => {
          const base = {
            id: d.id,
            label: d.label,
            required: d.required,
            weight: settings.weightMode === "custom" ? d.weight : 0,
            legalException: d.legalException,
          };
          return d.type === "specialist"
            ? { ...base, type: "specialist" as const }
            : {
                ...base,
                type: "basic" as const,
                kind: d.kind,
                source: d.source,
                config: cleanConfig(d),
              };
        }),
      });
      if (!result.ok) {
        setErrors(result.errors);
        toast.error(t("failed"));
        return;
      }
      setErrors([]);
      setDirty(false);
      toast.success(t("saved"));
    });
  }

  const basics = drafts.filter((d): d is BasicDraft => d.type === "basic");
  const specialists = drafts.filter((d): d is SpecialistDraft => d.type === "specialist");
  const linesError = errors.some((e) => e.index === -1);

  return (
    <fieldset disabled={!canEdit} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.title")}</CardTitle>
          <CardDescription>{t("settings.linesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-wrap gap-6">
            <NumberField
              id="passLine"
              label={t("settings.passLine")}
              unit={t("settings.points")}
              value={settings.passLine}
              min={1}
              onChange={(passLine) => changeSettings({ passLine: passLine ?? 0 })}
            />
            <NumberField
              id="failLine"
              label={t("settings.failLine")}
              unit={t("settings.points")}
              value={settings.failLine}
              min={0}
              onChange={(failLine) => changeSettings({ failLine: failLine ?? 0 })}
            />
          </div>
          {linesError || settings.failLine >= settings.passLine ? (
            <p className="text-sm text-destructive">{t("errors.lines")}</p>
          ) : null}
          <ToggleRow
            id="autoJudge"
            label={t("settings.autoJudge")}
            hint={t("settings.autoJudgeHint")}
            checked={settings.autoJudge}
            onChange={(autoJudge) => changeSettings({ autoJudge })}
          />
          <ToggleRow
            id="confirmRejections"
            label={t("settings.confirmRejections")}
            hint={t("settings.confirmRejectionsHint")}
            checked={settings.confirmRejections}
            onChange={(confirmRejections) => changeSettings({ confirmRejections })}
          />
          {!settings.confirmRejections ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>{t("settings.confirmRejectionsOff")}</AlertDescription>
            </Alert>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("settings.weightMode")}</legend>
            <RadioGroup
              value={settings.weightMode}
              onValueChange={(value) =>
                changeSettings({ weightMode: value as Settings["weightMode"] })
              }
              className="flex flex-wrap gap-5"
            >
              {(["equal", "custom"] as const).map((mode) => (
                <Label key={mode} className="font-normal">
                  <RadioGroupItem value={mode} />
                  {t(`settings.${mode}`)}
                </Label>
              ))}
            </RadioGroup>
            <p
              className={cn(
                "text-sm",
                total === 100 || drafts.length === 0 ? "text-muted-foreground" : "text-destructive",
              )}
              aria-live="polite"
            >
              {t("settings.total", { total })}
              {total !== 100 && drafts.length > 0 ? ` ${t("settings.totalWarning")}` : ""}
            </p>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("basic.title")}</CardTitle>
          <CardDescription>{t("basic.description")}</CardDescription>
          {canEdit ? (
            <CardAction className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {t("basic.presets")}
                    <ChevronDownIcon aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {BASIC_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.key}
                      onSelect={() =>
                        add({
                          key: newKey(),
                          type: "basic",
                          label: preset.label,
                          kind: preset.kind,
                          source: preset.source,
                          config: structuredClone(preset.config),
                          required: false,
                          weight: 0,
                          legalException: null,
                        } as BasicDraft)
                      }
                    >
                      {preset.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  add({
                    key: newKey(),
                    type: "basic",
                    label: "",
                    kind: "choices",
                    source: "form",
                    config: structuredClone(DEFAULT_CONFIG.choices),
                    required: false,
                    weight: 0,
                    legalException: null,
                  })
                }
              >
                <PlusIcon aria-hidden />
                {t("basic.add")}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {basics.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : null}
          {basics.map((draft) => (
            <ItemShell
              key={draft.key}
              draft={draft}
              weight={weights.get(draft.key) ?? 0}
              customWeights={settings.weightMode === "custom"}
              error={errorFor(draft.key)}
              onChange={(patch) => update(draft.key, patch)}
              onRemove={() => remove(draft.key)}
              onMove={(by) => move(draft.key, by)}
            >
              <BasicFields draft={draft} onChange={(patch) => update(draft.key, patch)} />
            </ItemShell>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("specialist.title")}</CardTitle>
          <CardDescription>{t("specialist.description")}</CardDescription>
          {canEdit ? (
            <CardAction>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  add({
                    key: newKey(),
                    type: "specialist",
                    label: "",
                    required: false,
                    weight: 0,
                    legalException: null,
                  })
                }
              >
                <PlusIcon aria-hidden />
                {t("specialist.add")}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {specialists.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : null}
          {specialists.map((draft) => (
            <ItemShell
              key={draft.key}
              draft={draft}
              weight={weights.get(draft.key) ?? 0}
              customWeights={settings.weightMode === "custom"}
              error={errorFor(draft.key)}
              onChange={(patch) => update(draft.key, patch)}
              onRemove={() => remove(draft.key)}
              onMove={(by) => move(draft.key, by)}
            />
          ))}
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("specialist.examples")}</span>
              {SPECIALIST_EXAMPLES.map((example) => (
                <Button
                  key={example}
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    add({
                      key: newKey(),
                      type: "specialist",
                      label: example,
                      required: false,
                      weight: 0,
                      legalException: null,
                    })
                  }
                >
                  <PlusIcon aria-hidden />
                  {example}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          {dirty ? <span className="text-sm text-muted-foreground">{t("unsaved")}</span> : null}
          <Button disabled={saving || !dirty} onClick={save}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/** Config without blank options, and pass/line values that still exist. */
function cleanConfig(d: BasicDraft): ChoicesConfig | DropdownConfig | RangeConfig {
  if (d.kind === "range") return d.config;
  const options = d.config.options.map((o) => o.trim()).filter(Boolean);
  if (d.kind === "choices") {
    return { ...d.config, options, pass: d.config.pass.filter((p) => options.includes(p)) };
  }
  return { ...d.config, options };
}

function ItemShell({
  draft,
  weight,
  customWeights,
  error,
  onChange,
  onRemove,
  onMove,
  children,
}: {
  draft: Draft;
  weight: number;
  customWeights: boolean;
  error: CriteriaError | undefined;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
  children?: ReactNode;
}) {
  const t = useTranslations("Criteria");
  const options = draft.type === "basic" && draft.kind !== "range" ? draft.config.options : [];
  const fairness = checkCriterionText(draft.label, ...options);
  const id = `criterion-${draft.key}`;

  return (
    <div
      className={cn(
        "grid gap-4 rounded-xl border p-4",
        (error || fairness?.level === "blocked") && "border-destructive",
      )}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-56 flex-1 gap-2">
          <Label htmlFor={id}>{t("basic.label")}</Label>
          <Input
            id={id}
            value={draft.label}
            maxLength={draft.type === "specialist" ? 100 : 60}
            placeholder={
              draft.type === "specialist" ? t("specialist.placeholder") : t("basic.newLabel")
            }
            aria-invalid={error || fairness?.level === "blocked" ? true : undefined}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <Label className="h-8 font-normal">
          <Switch checked={draft.required} onCheckedChange={(required) => onChange({ required })} />
          {t("required")}
        </Label>
        {customWeights ? (
          <NumberField
            id={`${id}-weight`}
            label={t("weight")}
            unit="点"
            value={draft.weight}
            min={0}
            onChange={(value) => onChange({ weight: value ?? 0 })}
          />
        ) : (
          <Badge variant="outline" className="h-8">
            {t("weight")} {weight}点
          </Badge>
        )}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("moveUp")}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("moveDown")}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("remove")} onClick={onRemove}>
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      </div>
      {draft.required ? (
        <p className="-mt-2 text-xs text-muted-foreground">{t("requiredHint")}</p>
      ) : null}

      {fairness?.level === "blocked" ? (
        <p className="text-sm text-destructive">{t("errors.blocked", { topic: fairness.topic })}</p>
      ) : null}
      {fairness?.level === "age" ? (
        <div className="grid gap-2 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          <p>{t("age.warning")}</p>
          <Label htmlFor={`${id}-exception`}>{t("age.exception")}</Label>
          <NativeSelect
            id={`${id}-exception`}
            value={draft.legalException ?? ""}
            onChange={(e) => onChange({ legalException: e.target.value || null })}
          >
            <option value="">{t("age.select")}</option>
            {Object.entries(AGE_EXCEPTIONS).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      {children}

      {error && error.code !== "blocked" ? (
        <p className="text-sm text-destructive">{t(`errors.${error.code}`)}</p>
      ) : null}
    </div>
  );
}

function BasicFields({
  draft,
  onChange,
}: {
  draft: BasicDraft;
  onChange: (patch: Partial<BasicDraft>) => void;
}) {
  const t = useTranslations("Criteria.basic");
  const id = `criterion-${draft.key}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-source`}>{t("source")}</Label>
          <NativeSelect
            id={`${id}-source`}
            value={draft.source}
            className="w-56"
            onChange={(e) => onChange({ source: e.target.value as BasicDraft["source"] })}
          >
            <option value="form">{t("sourceForm")}</option>
            <option value="resume">{t("sourceResume")}</option>
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-kind`}>{t("kind")}</Label>
          <NativeSelect
            id={`${id}-kind`}
            value={draft.kind}
            className="w-48"
            onChange={(e) => {
              const kind = e.target.value as BasicDraft["kind"];
              onChange({
                kind,
                config: structuredClone(DEFAULT_CONFIG[kind]),
              } as Partial<BasicDraft>);
            }}
          >
            {(["choices", "dropdown", "range"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {draft.kind === "range" ? (
        <div className="flex flex-wrap gap-4">
          <NumberField
            id={`${id}-min`}
            label={t("min")}
            value={draft.config.min ?? null}
            onChange={(min) => onChange({ config: { ...draft.config, min } })}
          />
          <NumberField
            id={`${id}-max`}
            label={t("max")}
            value={draft.config.max ?? null}
            onChange={(max) => onChange({ config: { ...draft.config, max } })}
          />
          <div className="grid gap-2">
            <Label htmlFor={`${id}-unit`}>{t("unit")}</Label>
            <Input
              id={`${id}-unit`}
              className="w-24"
              maxLength={10}
              value={draft.config.unit}
              onChange={(e) => onChange({ config: { ...draft.config, unit: e.target.value } })}
            />
          </div>
        </div>
      ) : (
        <OptionList draft={draft} onChange={onChange} />
      )}
    </div>
  );
}

function OptionList({
  draft,
  onChange,
}: {
  draft: Extract<BasicDraft, { kind: "choices" | "dropdown" }>;
  onChange: (patch: Partial<BasicDraft>) => void;
}) {
  const t = useTranslations("Criteria.basic");
  const id = `criterion-${draft.key}`;
  const options = draft.config.options;
  const setOptions = (next: string[]) => {
    if (draft.kind === "choices") {
      // Keep pass marks on options that were renamed in place.
      const pass = draft.config.pass
        .map((p) => (options.includes(p) ? next[options.indexOf(p)] : undefined))
        .filter((p): p is string => Boolean(p));
      onChange({ config: { ...draft.config, options: next, pass } });
    } else {
      const lineIndex = options.indexOf(draft.config.line);
      onChange({ config: { ...draft.config, options: next, line: next[lineIndex] ?? "" } });
    }
  };

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("options")}</legend>
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={t("option", { n: index + 1 })}
              value={option}
              maxLength={50}
              className="max-w-72"
              onChange={(e) =>
                setOptions(options.map((o, i) => (i === index ? e.target.value : o)))
              }
            />
            {draft.kind === "choices" ? (
              <Label className="font-normal">
                <Checkbox
                  checked={draft.config.pass.includes(option) && option !== ""}
                  disabled={!option.trim()}
                  onCheckedChange={(checked) =>
                    onChange({
                      config: {
                        ...draft.config,
                        pass: checked
                          ? [...draft.config.pass, option]
                          : draft.config.pass.filter((p) => p !== option),
                      },
                    })
                  }
                />
                {t("passes")}
              </Label>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${t("option", { n: index + 1 })}: ×`}
              disabled={options.length <= 2}
              onClick={() => setOptions(options.filter((_, i) => i !== index))}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          disabled={options.length >= (draft.kind === "choices" ? MAX_CHOICES : 20)}
          onClick={() => setOptions([...options, ""])}
        >
          <PlusIcon aria-hidden />
          {t("addOption")}
        </Button>
      </fieldset>

      {draft.kind === "choices" && draft.source === "form" ? (
        <Label className="font-normal">
          <Switch
            checked={draft.config.multi ?? false}
            onCheckedChange={(multi) => onChange({ config: { ...draft.config, multi } })}
          />
          {t("multi")}
        </Label>
      ) : null}

      {draft.kind === "dropdown" ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-line`}>{t("line")}</Label>
            <NativeSelect
              id={`${id}-line`}
              className="w-56"
              value={draft.config.line}
              onChange={(e) => onChange({ config: { ...draft.config, line: e.target.value } })}
            >
              <option value="">—</option>
              {options.filter(Boolean).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </NativeSelect>
          </div>
          <RadioGroup
            aria-label={t("dir")}
            value={draft.config.dir}
            onValueChange={(dir) =>
              onChange({ config: { ...draft.config, dir: dir as DropdownConfig["dir"] } })
            }
            className="flex h-9 gap-4"
          >
            {(["upto", "from"] as const).map((dir) => (
              <Label key={dir} className="font-normal">
                <RadioGroupItem value={dir} />
                {t(dir)}
              </Label>
            ))}
          </RadioGroup>
        </div>
      ) : null}
    </div>
  );
}

/** A small number input; blank means "no value" (null). */
function NumberField({
  id,
  label,
  unit,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  unit?: string;
  value: number | null;
  min?: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          className="w-24"
          min={min}
          max={100_000}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Math.round(Number(e.target.value)))
          }
        />
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
      />
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}
