"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ANCHORS,
  type Anchor,
  CUSTOM_TEMPLATE,
  EVENT_TIMINGS,
  MERGE_FIELDS,
  type MergeValues,
  renderConcerns,
  renderTemplate,
  type Timing,
  timingsFor,
  type Trigger,
  validateTemplate,
} from "@/features/scheduling/templates";
import {
  deleteCustomMessageAction,
  resetTemplateAction,
  saveCustomMessageAction,
  saveTemplateAction,
  setTestModeAction,
} from "../actions";
import type { CustomMessageSetting, TemplateScope, TemplateSetting } from "../queries";

const SAMPLE: MergeValues = {
  name: "山田 花子",
  company: "株式会社サンプル",
  job: "法人営業",
  booking_url: "https://mask0.example/p/xxxx/book",
  portal_url: "https://mask0.example/p/xxxx",
  upload_url: "https://mask0.example/p/xxxx",
  consent_url: "https://mask0.example/p/xxxx/consent",
  entry_url: "https://mask0.example/a/abc123",
  interview_at: "11月4日（水）10:00〜11:00",
  tool: "オンライン（Web会議）",
  meeting_url: "https://meet.example/abc",
  concerns: renderConcerns([{ label: "服装", answer: "私服でお越しください。" }]),
};

const GROUPS: { key: "invite" | "ai" | "interview" | "result" | "pool"; triggers: Trigger[] }[] = [
  { key: "invite", triggers: ["pass", "follow_up", "next_round"] },
  { key: "ai", triggers: ["ai_invite", "ai_remind"] },
  {
    key: "interview",
    triggers: [
      "confirmed",
      "remind_5d",
      "remind_3d",
      "reminder",
      "interview_day",
      "thanks",
      "no_show",
    ],
  },
  { key: "result", triggers: ["rejection", "cv_missing"] },
  { key: "pool", triggers: ["pool_suggestion"] },
];

type Target = { orgSlug: string; clientSlug: string };

/** Email templates, timing, custom emails and test mode (docs/02 M9-2, M9-3, M9-6). */
export function EmailSettings({
  target,
  testMode,
  templates,
  customMessages,
  scope,
  agency,
  aiInterview = false,
}: {
  target: Target;
  testMode: boolean;
  templates: TemplateSetting[];
  customMessages: CustomMessageSetting[];
  scope: TemplateScope;
  /** For agencies: the current client's name, which can have its own wording. */
  agency: { clientName: string } | null;
  /** The AI interviewer's emails show only where the feature is on. */
  aiInterview?: boolean;
}) {
  const t = useTranslations("Settings.email");
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(0);
  const base = `/app/${target.orgSlug}/${target.clientSlug}/settings?tab=email`;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3">
            <Switch
              id="test-mode"
              checked={testMode}
              disabled={pending}
              aria-describedby="test-mode-hint"
              onCheckedChange={(on) =>
                startTransition(() => setTestModeAction(target.orgSlug, target.clientSlug, on))
              }
            />
            <div className="grid gap-1">
              <Label htmlFor="test-mode">{t("testMode")}</Label>
              <p id="test-mode-hint" className="text-xs text-muted-foreground">
                {t("testModeHint")}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("quietHours")}</p>
          {agency ? (
            <nav aria-label={t("scopeLabel")} className="flex flex-wrap gap-1">
              {(["org", "client"] as const).map((item) => (
                <Link
                  key={item}
                  href={item === "org" ? base : `${base}&scope=client`}
                  aria-current={item === scope ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                    item === scope && "bg-muted font-medium",
                  )}
                >
                  {item === "org" ? t("scopeOrg") : t("scopeClient", { client: agency.clientName })}
                </Link>
              ))}
            </nav>
          ) : null}
          {scope === "client" ? (
            <p className="text-sm text-muted-foreground">{t("scopeClientHint")}</p>
          ) : null}
        </CardContent>
      </Card>

      {GROUPS.filter((g) => (g.key !== "pool" || agency) && (g.key !== "ai" || aiInterview)).map(
        (group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="grid gap-2">
            <h2 id={`group-${group.key}`} className="text-sm font-semibold">
              {t(`groups.${group.key}`)}
            </h2>
            <Accordion type="multiple" className="rounded-xl border bg-card px-4">
              {group.triggers.map((trigger) => {
                const template = templates.find((x) => x.trigger === trigger)!;
                return (
                  <TemplateEditor
                    key={`${scope}-${trigger}-${template.custom}`}
                    target={target}
                    scope={scope}
                    template={template}
                  />
                );
              })}
            </Accordion>
          </section>
        ),
      )}

      <section aria-labelledby="group-custom" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="group-custom" className="text-sm font-semibold">
              {t("groups.custom")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("customHint")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDrafts((n) => n + 1)}>
            <PlusIcon aria-hidden />
            {t("customAdd")}
          </Button>
        </div>
        {customMessages.length === 0 && drafts === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            {t("customEmpty")}
          </p>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={drafts > 0 ? [`draft-${drafts}`] : []}
            className="rounded-xl border bg-card px-4"
          >
            {customMessages.map((message) => (
              <CustomEditor key={message.id} target={target} scope={scope} message={message} />
            ))}
            {drafts > 0 ? (
              <CustomEditor
                key={`draft-${drafts}`}
                target={target}
                scope={scope}
                message={null}
                onSaved={() => setDrafts(0)}
                itemValue={`draft-${drafts}`}
              />
            ) : null}
          </Accordion>
        )}
      </section>
    </div>
  );
}

function FieldsHelp() {
  const t = useTranslations("Settings.email");
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{t("fields")}</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {MERGE_FIELDS.map((field) => (
          <li key={field}>
            <code className="rounded bg-muted px-1">{`{${field}}`}</code> {t(`fieldNames.${field}`)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Problems({ problems }: { problems: ReturnType<typeof validateTemplate> }) {
  const t = useTranslations("Settings.email");
  return (
    <ul className="grid gap-1 text-sm text-destructive" aria-live="polite">
      {problems.map((p, i) => (
        <li key={i}>
          {p.code === "empty"
            ? t("problems.empty")
            : t(`problems.${p.code}`, { field: `{${p.field}}` })}
        </li>
      ))}
    </ul>
  );
}

function Preview({ subject, body }: { subject: string; body: string }) {
  const t = useTranslations("Settings.email");
  const preview = renderTemplate({ subject, body }, SAMPLE);
  return (
    <div className="grid content-start gap-1.5">
      <p className="text-sm font-medium">{t("preview")}</p>
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">{preview.subject}</p>
        <p className="whitespace-pre-wrap">{preview.body}</p>
      </div>
    </div>
  );
}

function TemplateEditor({
  target,
  scope,
  template,
}: {
  target: Target;
  scope: TemplateScope;
  template: TemplateSetting;
}) {
  const t = useTranslations("Settings.email");
  const [enabled, setEnabled] = useState(template.enabled);
  const [timing, setTiming] = useState<Timing | null>(template.timing);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [pending, startTransition] = useTransition();
  const problems = validateTemplate(template.trigger, { subject, body });
  const id = `template-${template.trigger}`;
  const dirty =
    enabled !== template.enabled ||
    timing !== template.timing ||
    subject !== template.subject ||
    body !== template.body;

  function save() {
    startTransition(async () => {
      const result = await saveTemplateAction(target.orgSlug, target.clientSlug, {
        trigger: template.trigger,
        scope,
        enabled,
        timing,
        subject,
        body,
      });
      if (result.ok) toast.success(t("saved"));
    });
  }

  return (
    <AccordionItem value={template.trigger}>
      <AccordionTrigger>
        <span className="flex flex-wrap items-center gap-2">
          <span id={`${id}-name`}>{t(`triggers.${template.trigger}`)}</span>
          {template.custom ? <Badge variant="outline">{t("custom")}</Badge> : null}
          {!template.enabled ? <Badge variant="secondary">{t("off")}</Badge> : null}
          {template.timing ? (
            <span className="text-xs font-normal text-muted-foreground">
              {t(`timings.${template.timing}`)}
            </span>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`${id}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-labelledby={`${id}-name ${id}-enabled-label`}
            />
            <Label id={`${id}-enabled-label`} htmlFor={`${id}-enabled`} className="font-normal">
              {t("enabled")}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">{t(`when.${template.trigger}`)}</p>
          {timing ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-timing`}>{t("timing")}</Label>
              <NativeSelect
                id={`${id}-timing`}
                value={timing}
                onChange={(e) => setTiming(e.target.value as Timing)}
                className="w-56"
              >
                {EVENT_TIMINGS.map((value) => (
                  <option key={value} value={value}>
                    {t(`timings.${value}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-subject`}>{t("subject")}</Label>
            <Input
              id={`${id}-subject`}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-body`}>{t("body")}</Label>
            <Textarea
              id={`${id}-body`}
              rows={12}
              maxLength={5000}
              value={body}
              aria-invalid={problems.length > 0 ? true : undefined}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <FieldsHelp />
          <Problems problems={problems} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || !dirty || problems.length > 0} onClick={save}>
              {t("save")}
            </Button>
            {template.custom ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(() =>
                    resetTemplateAction(target.orgSlug, target.clientSlug, template.trigger, scope),
                  )
                }
              >
                {scope === "client" ? t("resetToOrg") : t("reset")}
              </Button>
            ) : null}
          </div>
        </div>
        <Preview subject={subject} body={body} />
      </AccordionContent>
    </AccordionItem>
  );
}

function CustomEditor({
  target,
  scope,
  message,
  onSaved,
  itemValue,
}: {
  target: Target;
  scope: TemplateScope;
  message: CustomMessageSetting | null;
  onSaved?: () => void;
  itemValue?: string;
}) {
  const t = useTranslations("Settings.email");
  const [name, setName] = useState(message?.name ?? "");
  const [anchor, setAnchor] = useState<Anchor>(message?.anchor ?? "applied");
  const [timing, setTiming] = useState<Timing>(message?.timing ?? "next_day_10");
  const [enabled, setEnabled] = useState(message?.enabled ?? true);
  const [subject, setSubject] = useState(message?.subject ?? CUSTOM_TEMPLATE.subject);
  const [body, setBody] = useState(message?.body ?? CUSTOM_TEMPLATE.body);
  const [pending, startTransition] = useTransition();
  const problems = validateTemplate(null, { subject, body });
  const id = `custom-${message?.id ?? "new"}`;
  const choices = timingsFor(anchor);

  function save() {
    startTransition(async () => {
      const result = await saveCustomMessageAction(target.orgSlug, target.clientSlug, {
        id: message?.id,
        scope,
        name,
        anchor,
        timing: choices.includes(timing) ? timing : "immediately",
        enabled,
        subject,
        body,
      });
      if (result.ok) {
        toast.success(t("saved"));
        onSaved?.();
      }
    });
  }

  return (
    <AccordionItem value={itemValue ?? message!.id}>
      <AccordionTrigger>
        <span className="flex flex-wrap items-center gap-2">
          <span id={`${id}-name`}>{name || t("customUntitled")}</span>
          {!enabled ? <Badge variant="secondary">{t("off")}</Badge> : null}
          <span className="text-xs font-normal text-muted-foreground">
            {t(`anchors.${anchor}`)}・{t(`timings.${timing}`)}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-title`}>{t("customName")}</Label>
            <Input
              id={`${id}-title`}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("customNamePlaceholder")}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-anchor`}>{t("anchor")}</Label>
              <NativeSelect
                id={`${id}-anchor`}
                value={anchor}
                onChange={(e) => setAnchor(e.target.value as Anchor)}
                className="w-52"
              >
                {ANCHORS.map((value) => (
                  <option key={value} value={value}>
                    {t(`anchors.${value}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-timing`}>{t("timing")}</Label>
              <NativeSelect
                id={`${id}-timing`}
                value={choices.includes(timing) ? timing : "immediately"}
                onChange={(e) => setTiming(e.target.value as Timing)}
                className="w-56"
              >
                {choices.map((value) => (
                  <option key={value} value={value}>
                    {t(`timings.${value}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${id}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-labelledby={`${id}-name ${id}-enabled-label`}
            />
            <Label id={`${id}-enabled-label`} htmlFor={`${id}-enabled`} className="font-normal">
              {t("enabled")}
            </Label>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-subject`}>{t("subject")}</Label>
            <Input
              id={`${id}-subject`}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-body`}>{t("body")}</Label>
            <Textarea
              id={`${id}-body`}
              rows={10}
              maxLength={5000}
              value={body}
              aria-invalid={problems.length > 0 ? true : undefined}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <FieldsHelp />
          <Problems problems={problems} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || !name.trim() || problems.length > 0} onClick={save}>
              {t("save")}
            </Button>
            {message ? (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(() =>
                    deleteCustomMessageAction(target.orgSlug, target.clientSlug, message.id),
                  )
                }
              >
                {t("customDelete")}
              </Button>
            ) : null}
          </div>
        </div>
        <Preview subject={subject} body={body} />
      </AccordionContent>
    </AccordionItem>
  );
}
