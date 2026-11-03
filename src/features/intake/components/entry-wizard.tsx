"use client";

import { CheckCircle2Icon, ChevronLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FormAlert } from "@/components/form-alert";
import { NativeSelect } from "@/components/native-select";
import { Turnstile, turnstileSiteKey } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAY_BANDS, START_TIMINGS } from "@/features/screening/presets";
import { uploadToSignedUrl } from "@/lib/upload";
import { cn } from "@/lib/utils";
import type { EntryView } from "../entry-server";
import { type AnswerValue, contactSchema, type EntryQuestion } from "../entry-schema";
import { PREFECTURES } from "../prefectures";
import { DocumentPicker, type PickedFile } from "./document-picker";

type Step = 1 | 2 | 3 | 4;

type FormState = {
  name: string;
  phone: string;
  email: string;
  prefecture: string;
  city: string;
  payBand: string;
  startTiming: string;
  answers: Record<string, AnswerValue>;
  otherJobsOptIn: boolean;
  website: string;
};

const EMPTY: FormState = {
  name: "",
  phone: "",
  email: "",
  prefecture: "",
  city: "",
  payBand: "",
  startTiming: "",
  answers: {},
  otherJobsOptIn: false,
  website: "",
};

// Typed input survives a reload (docs/02 M3-3); files and consent do not.
function restore(key: string): FormState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const saved = window.sessionStorage.getItem(key);
    return saved ? { ...EMPTY, ...(JSON.parse(saved) as Partial<FormState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const isBlank = (value: AnswerValue | undefined) =>
  value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** The public entry page (docs/01 §6.1): intro → contact → documents → confirm → done. */
export function EntryWizard({ entry }: { entry: EntryView }) {
  const t = useTranslations("Entry");
  const storageKey = `mask0.entry.${entry.code}`;
  const [form, setForm] = useState<FormState>(() => restore(storageKey));
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "uploading">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Bumped after a failed submit: a Turnstile token works once, so the widget starts over.
  const [attempt, setAttempt] = useState(0);
  // A repeat entry gets no link on screen; it is emailed to the address on file instead.
  const [done, setDone] = useState<{ portalUrl: string | null } | null>(null);
  const openedAt = useRef(0);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // Private browsing can refuse storage; the form still works without it.
    }
  }, [form, storageKey]);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const setAnswer = (id: string, value: AnswerValue) =>
    setForm((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));

  function go(next: Step) {
    setStep(next);
    setErrors({});
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
  }

  function checkContact(): boolean {
    const next: Record<string, string> = {};
    const result = contactSchema.safeParse(form);
    if (!result.success) {
      for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message;
    }
    for (const q of entry.questions) {
      if (isBlank(form.answers[q.id])) next[`q:${q.id}`] = "answerRequired";
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.getElementById(fieldId(first))?.focus();
    return !first;
  }

  function checkDocuments(): boolean {
    const next: Record<string, string> = {};
    if (!files.some((f) => f.kind === "resume")) next.resume = "resumeRequired";
    if (entry.requiresCv && !files.some((f) => f.kind === "cv")) next.cv = "cvRequired";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!consent) {
      setErrors({ consent: "consentRequired" });
      return;
    }
    setPhase("sending");
    setSubmitError(null);
    try {
      const response = await fetch(`/api/entry/${entry.code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          prefecture: form.prefecture,
          city: form.city,
          payBand: form.payBand,
          startTiming: form.startTiming,
          answers: form.answers,
          files: files.map(({ kind, file }) => ({
            kind,
            name: file.name.slice(0, 200),
            type: file.type,
            size: file.size,
          })),
          consent: true,
          otherJobsOptIn: form.otherJobsOptIn,
          website: form.website,
          elapsedMs: Date.now() - openedAt.current,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setTurnstileToken(null);
        setAttempt((a) => a + 1);
        const known = ["closed", "rateLimited", "notFound", "challenge"];
        setSubmitError(
          t(
            `errors.${known.includes(body.error ?? "") ? body.error : "invalid"}` as "errors.invalid",
          ),
        );
        setPhase("idle");
        return;
      }
      const { receipt, token, uploads } = (await response.json()) as {
        receipt: string;
        token: string | null;
        uploads: { index: number; path: string; token: string }[];
      };
      setPhase("uploading");
      setProgress({ done: 0, total: uploads.length });
      for (const upload of uploads) {
        await uploadToSignedUrl("documents", upload.path, upload.token, files[upload.index]!.file);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      await fetch(`/api/entry/${entry.code}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore: see above.
      }
      setDone({ portalUrl: token ? `${window.location.origin}/p/${token}` : null });
      requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
    } catch {
      setSubmitError(t("errors.network"));
      setTurnstileToken(null);
      setAttempt((a) => a + 1);
    } finally {
      setPhase("idle");
    }
  }

  if (done) return <Done portalUrl={done.portalUrl} demo={entry.demo} />;

  if (!entry.open) {
    return (
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">{entry.company}</p>
          <CardTitle>{t("closed.title")}</CardTitle>
          <CardDescription>{t("closed.body")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div ref={top} className="grid scroll-mt-4 gap-6">
      {entry.demo ? (
        <section className="grid gap-1.5 rounded-xl border border-dashed bg-muted/40 p-4 text-sm">
          <h2 className="font-medium">{t("demo.title")}</h2>
          <p className="text-muted-foreground">{t("demo.body")}</p>
          <a href="/demo/sample-resume.pdf" download className="font-medium text-primary underline">
            {t("demo.sample")}
          </a>
        </section>
      ) : null}
      <Steps current={step} />

      {step === 1 ? (
        <div className="grid gap-5">
          <JobCard entry={entry} />
          <p>{t("intro.thanks", { channel: entry.channel })}</p>
          <div className="grid gap-2 rounded-xl border bg-card p-4">
            <h2 className="font-medium">{t("intro.prepare")}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{t("intro.resume")}</li>
              <li>{entry.requiresCv ? t("intro.cvRequired") : t("intro.cvOptional")}</li>
            </ul>
            <p className="text-sm text-muted-foreground">{t("intro.time")}</p>
          </div>
          <Button size="lg" className="h-11" onClick={() => go(2)}>
            {t("intro.start")}
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (checkContact()) go(3);
          }}
        >
          <h2 className="text-lg font-bold">{t("contact.title")}</h2>
          <Field id="name" label={t("contact.name")} error={errors.name} required>
            <Input
              id="name"
              autoComplete="name"
              value={form.name}
              placeholder={t("contact.namePlaceholder")}
              maxLength={50}
              aria-invalid={errors.name ? true : undefined}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field id="phone" label={t("contact.phone")} error={errors.phone} required>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={form.phone}
              placeholder={t("contact.phonePlaceholder")}
              maxLength={30}
              aria-invalid={errors.phone ? true : undefined}
              onChange={(e) => update({ phone: e.target.value })}
            />
          </Field>
          <Field
            id="email"
            label={t("contact.email")}
            error={errors.email}
            hint={t("contact.emailHint")}
            required
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              maxLength={254}
              aria-invalid={errors.email ? true : undefined}
              onChange={(e) => update({ email: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="prefecture"
              label={t("contact.prefecture")}
              error={errors.prefecture}
              required
            >
              <NativeSelect
                id="prefecture"
                autoComplete="address-level1"
                value={form.prefecture}
                aria-invalid={errors.prefecture ? true : undefined}
                onChange={(e) => update({ prefecture: e.target.value })}
              >
                <option value="">{t("contact.select")}</option>
                {PREFECTURES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="city" label={t("contact.city")} error={errors.city} required>
              <Input
                id="city"
                autoComplete="address-level2"
                value={form.city}
                placeholder={t("contact.cityPlaceholder")}
                maxLength={50}
                aria-invalid={errors.city ? true : undefined}
                onChange={(e) => update({ city: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="payBand" label={t("contact.payBand")} error={errors.payBand} required>
              <NativeSelect
                id="payBand"
                value={form.payBand}
                aria-invalid={errors.payBand ? true : undefined}
                onChange={(e) => update({ payBand: e.target.value })}
              >
                <option value="">{t("contact.select")}</option>
                {PAY_BANDS.map((band) => (
                  <option key={band}>{band}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="startTiming"
              label={t("contact.startTiming")}
              error={errors.startTiming}
              required
            >
              <NativeSelect
                id="startTiming"
                value={form.startTiming}
                aria-invalid={errors.startTiming ? true : undefined}
                onChange={(e) => update({ startTiming: e.target.value })}
              >
                <option value="">{t("contact.select")}</option>
                {START_TIMINGS.map((timing) => (
                  <option key={timing}>{timing}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {entry.questions.length > 0 ? (
            <fieldset className="grid gap-5 rounded-xl border bg-card p-4">
              <legend className="px-1 text-sm font-medium">{t("contact.questions")}</legend>
              {entry.questions.map((q) => (
                <Question
                  key={q.id}
                  question={q}
                  value={form.answers[q.id]}
                  error={errors[`q:${q.id}`]}
                  onChange={(value) => setAnswer(q.id, value)}
                />
              ))}
            </fieldset>
          ) : null}

          <p className="text-sm text-muted-foreground">{t("contact.workHistoryNote")}</p>

          {/* Honeypot: invisible to people and screen readers, tempting to form-filling bots. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => update({ website: e.target.value })}
              />
            </label>
          </div>

          <Nav onBack={() => go(1)} nextLabel={t("next")} />
        </form>
      ) : null}

      {step === 3 ? (
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (checkDocuments()) go(4);
          }}
        >
          <h2 className="text-lg font-bold">{t("documents.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("documents.hint")}</p>
          <DocumentPicker
            kind="resume"
            label={t("documents.resume")}
            required
            files={files}
            onChange={setFiles}
            invalid={errors.resume}
          />
          <DocumentPicker
            kind="cv"
            label={t("documents.cv")}
            required={entry.requiresCv}
            files={files}
            onChange={setFiles}
            invalid={errors.cv}
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("documents.photoTips")}</li>
            {!entry.requiresCv ? <li>{t("documents.cvLater")}</li> : null}
            <li>{t("documents.fairness")}</li>
          </ul>
          <Nav onBack={() => go(2)} nextLabel={t("next")} />
        </form>
      ) : null}

      {step === 4 ? (
        <div className="grid gap-5">
          <h2 className="text-lg font-bold">{t("confirm.title")}</h2>
          <Summary entry={entry} form={form} files={files} onEdit={go} />
          <section className="grid gap-2 rounded-xl border bg-card p-4" aria-labelledby="notice">
            <h3 id="notice" className="font-medium">
              {t("confirm.noticeTitle")}
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {entry.notice.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <div className="grid gap-3">
            <Label className="items-start font-normal">
              <Checkbox
                checked={consent}
                aria-invalid={errors.consent ? true : undefined}
                onCheckedChange={(checked) => setConsent(checked === true)}
                className="mt-0.5"
              />
              {t("confirm.consent")}
            </Label>
            {errors.consent ? (
              <p className="text-sm text-destructive">
                {t(`errors.${errors.consent}` as "errors.consentRequired")}
              </p>
            ) : null}
            {entry.otherJobsLabel ? (
              <Label className="items-start font-normal">
                <Checkbox
                  checked={form.otherJobsOptIn}
                  onCheckedChange={(checked) => update({ otherJobsOptIn: checked === true })}
                  className="mt-0.5"
                />
                {entry.otherJobsLabel}
              </Label>
            ) : null}
          </div>
          <Turnstile key={attempt} action="entry" onToken={setTurnstileToken} />
          <FormAlert error={submitError ?? undefined} />
          <div className="grid gap-3">
            <Button
              size="lg"
              className="h-11"
              disabled={phase !== "idle" || (turnstileSiteKey !== null && !turnstileToken)}
              onClick={submit}
            >
              {phase === "sending"
                ? t("confirm.sending")
                : phase === "uploading"
                  ? t("confirm.uploading", progress)
                  : t("confirm.submit")}
            </Button>
            <Button variant="ghost" disabled={phase !== "idle"} onClick={() => go(3)}>
              <ChevronLeftIcon aria-hidden />
              {t("back")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const fieldId = (key: string) => (key.startsWith("q:") ? `question-${key.slice(2)}` : key);

function Steps({ current }: { current: Step }) {
  const t = useTranslations("Entry");
  const names = [t("steps.intro"), t("steps.contact"), t("steps.documents"), t("steps.confirm")];
  return (
    <ol aria-label={t("stepsLabel")} className="grid grid-cols-4 gap-2 text-center text-xs">
      {names.map((name, index) => (
        <li
          key={name}
          aria-current={index + 1 === current ? "step" : undefined}
          className={cn(
            "grid gap-1.5",
            index + 1 <= current ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            className={cn("h-1 rounded-full", index + 1 <= current ? "bg-primary" : "bg-muted")}
          />
          {name}
        </li>
      ))}
    </ol>
  );
}

function JobCard({ entry }: { entry: EntryView }) {
  const t = useTranslations("Entry.intro");
  return (
    <Card className={entry.job.imageUrl ? "pt-0" : undefined}>
      {entry.job.imageUrl ? (
        // Job images are sized on upload and served from storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.job.imageUrl} alt="" className="aspect-4/3 w-full object-cover" />
      ) : null}
      <CardHeader>
        <p className="text-sm text-muted-foreground">{entry.company}</p>
        <CardTitle className="text-lg">{entry.job.title}</CardTitle>
        {entry.job.displayTitle ? (
          <CardDescription>{entry.job.displayTitle}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {entry.job.employmentType ? (
            <>
              <dt className="text-muted-foreground">{t("employmentType")}</dt>
              <dd>{entry.job.employmentType}</dd>
            </>
          ) : null}
          {entry.job.address ? (
            <>
              <dt className="text-muted-foreground">{t("address")}</dt>
              <dd>{entry.job.address}</dd>
            </>
          ) : null}
          {entry.job.pay ? (
            <>
              <dt className="text-muted-foreground">{t("pay")}</dt>
              <dd>{entry.job.pay}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Entry");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-xs font-normal text-destructive">{t("contact.required")}</span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${error}` as "errors.invalid")}
        </p>
      ) : null}
    </div>
  );
}

function Question({
  question: q,
  value,
  error,
  onChange,
}: {
  question: EntryQuestion;
  value: AnswerValue | undefined;
  error?: string;
  onChange: (value: AnswerValue) => void;
}) {
  const t = useTranslations("Entry");
  const id = `question-${q.id}`;
  const errorText = error ? (
    <p className="text-sm text-destructive" role="alert">
      {t(`errors.${error}` as "errors.answerRequired")}
    </p>
  ) : null;

  if (q.kind === "dropdown") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{q.label}</Label>
        <NativeSelect
          id={id}
          value={typeof value === "string" ? value : ""}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("contact.select")}</option>
          {q.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </NativeSelect>
        {errorText}
      </div>
    );
  }
  if (q.kind === "range") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{q.label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            className="w-32"
            value={typeof value === "number" ? value : ""}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
          <span className="text-sm">{q.unit}</span>
        </div>
        {errorText}
      </div>
    );
  }
  const picked = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  return (
    <fieldset className="grid gap-2" aria-describedby={q.multi ? `${id}-hint` : undefined}>
      <legend className="mb-2 text-sm font-medium">{q.label}</legend>
      {q.multi ? (
        <p id={`${id}-hint`} className="-mt-1 text-xs text-muted-foreground">
          {t("contact.multiHint")}
        </p>
      ) : null}
      <div className="grid gap-2" id={id} tabIndex={-1}>
        {q.options.map((option) => (
          <label
            key={option}
            className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
          >
            <input
              type={q.multi ? "checkbox" : "radio"}
              name={id}
              value={option}
              checked={picked.includes(option)}
              className="size-4 accent-primary"
              onChange={(e) => {
                if (!q.multi) onChange(option);
                else
                  onChange(
                    e.target.checked ? [...picked, option] : picked.filter((p) => p !== option),
                  );
              }}
            />
            {option}
          </label>
        ))}
      </div>
      {errorText}
    </fieldset>
  );
}

function Nav({ onBack, nextLabel }: { onBack: () => void; nextLabel: string }) {
  const t = useTranslations("Entry");
  return (
    <div className="grid gap-3">
      <Button type="submit" size="lg" className="h-11">
        {nextLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={onBack}>
        <ChevronLeftIcon aria-hidden />
        {t("back")}
      </Button>
    </div>
  );
}

function Summary({
  entry,
  form,
  files,
  onEdit,
}: {
  entry: EntryView;
  form: FormState;
  files: PickedFile[];
  onEdit: (step: Step) => void;
}) {
  const t = useTranslations("Entry");
  const answer = (q: EntryQuestion) => {
    const value = form.answers[q.id];
    const text = Array.isArray(value) ? value.join("・") : String(value ?? "");
    return q.kind === "range" && text ? `${text}${q.unit}` : text;
  };
  const rows: [string, string][] = [
    [t("contact.name"), form.name],
    [t("contact.phone"), form.phone],
    [t("contact.email"), form.email],
    [t("contact.prefecture"), `${form.prefecture} ${form.city}`],
    [t("contact.payBand"), form.payBand],
    [t("contact.startTiming"), form.startTiming],
    ...entry.questions.map((q): [string, string] => [q.label, answer(q)]),
  ];
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t("contact.title")}</h3>
          <Button variant="link" size="sm" onClick={() => onEdit(2)}>
            {t("confirm.edit")}
          </Button>
        </div>
        <dl className="grid gap-x-3 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t("confirm.files")}</h3>
          <Button variant="link" size="sm" onClick={() => onEdit(3)}>
            {t("confirm.edit")}
          </Button>
        </div>
        <ul className="grid gap-1 text-sm">
          {files.map((f) => (
            <li key={f.id} className="truncate">
              {f.kind === "resume" ? t("documents.resume") : t("documents.cv")}：{f.file.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Done({ portalUrl, demo }: { portalUrl: string | null; demo: boolean }) {
  const t = useTranslations("Entry.done");
  return (
    <div className="grid gap-5">
      <div className="grid justify-items-center gap-3 text-center">
        <CheckCircle2Icon className="size-12 text-primary" aria-hidden />
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm">{t("body")}</p>
      </div>
      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <h2 className="font-medium">{t("portal")}</h2>
        {portalUrl ? (
          <>
            <p className="text-sm text-muted-foreground">{t("portalHint")}</p>
            <a
              href={portalUrl}
              className="text-sm break-all text-primary underline underline-offset-4"
            >
              {portalUrl}
            </a>
            <div>
              <CopyButton value={portalUrl} />
            </div>
            {/* A /demo sandbox sends no email. */}
            {demo ? null : <p className="text-xs text-muted-foreground">{t("emailed")}</p>}
          </>
        ) : (
          <p className="text-sm">{t("repeat")}</p>
        )}
      </section>
      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <h2 className="font-medium">{t("nextTitle")}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>{t("next1")}</li>
          <li>{t("next2")}</li>
          <li>{t("next3")}</li>
        </ol>
      </section>
      <p className="text-sm text-muted-foreground">{t("mailNote")}</p>
    </div>
  );
}
