"use client";

import { CircleAlertIcon, CircleCheckIcon, DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Turnstile, turnstileSiteKey } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CONSULT_CATEGORIES,
  CONTACT_LIMITS,
  type ContactMode,
  DOWNLOAD_CATEGORY,
  GUIDE_PDF_PATH,
} from "./site-config";

/** JSON body sent to POST /api/contact. */
export type ContactRequest = {
  mode: ContactMode;
  company: string;
  name: string;
  email: string;
  phone: string;
  /** "download" in download mode; one of CONSULT_CATEGORIES in consult mode. */
  category: string;
  message: string;
  consent: boolean;
  /** Honeypot: always "" for people. */
  website: string;
  /** Milliseconds between the form mounting and the submission. */
  elapsedMs: number;
  /** Cloudflare Turnstile token, when Turnstile is set up. */
  turnstileToken?: string;
};

const MODES: readonly ContactMode[] = ["download", "consult"];

/** Fields that can show an error, in screen order (the first one with an error gets focus). */
const FIELDS = ["company", "name", "email", "phone", "category", "message", "consent"] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;

function isField(key: string): key is Field {
  return (FIELDS as readonly string[]).includes(key);
}

type Values = {
  company: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  message: string;
  consent: boolean;
  website: string;
};

const INITIAL_VALUES: Values = {
  company: "",
  name: "",
  email: "",
  phone: "",
  category: "",
  message: "",
  consent: false,
  website: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPhoneNumber(value: string) {
  if (!/^\+?[\d\s()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 15;
}

function isConsultCategory(value: string) {
  return (CONSULT_CATEGORIES as readonly string[]).includes(value);
}

function toRequest(values: Values, mode: ContactMode): Omit<ContactRequest, "elapsedMs"> {
  return {
    mode,
    company: values.company.trim(),
    name: values.name.trim(),
    // Japanese input methods often produce full-width letters, digits and "@"; NFKC maps them to ASCII.
    email: values.email.normalize("NFKC").trim(),
    phone: values.phone.normalize("NFKC").trim(),
    category: mode === "download" ? DOWNLOAD_CATEGORY : values.category,
    message: values.message.trim(),
    consent: values.consent,
    website: values.website,
  };
}

/** Reads `{ fields: { [field]: message } }` from a 400 response. */
function readFieldErrors(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null || !("fields" in body)) return {};
  const fields = body.fields;
  if (typeof fields !== "object" || fields === null) return {};
  const errors: Record<string, string> = {};
  for (const [field, message] of Object.entries(fields)) {
    if (typeof message === "string" && message) errors[field] = message;
  }
  return errors;
}

function isOkResponse(body: unknown) {
  return typeof body === "object" && body !== null && "ok" in body && body.ok === true;
}

export function ContactForm() {
  const t = useTranslations("Home.contact.form");
  const baseId = useId();
  const [mode, setMode] = useState<ContactMode>("download");
  const [values, setValues] = useState<Values>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Bumped after a failed submit: a Turnstile token works once.
  const [attempt, setAttempt] = useState(0);
  /** The mode whose submission succeeded; its thank-you panel replaces the form. */
  const [submitted, setSubmitted] = useState<ContactMode | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    startedAtRef.current = performance.now();
  }, []);

  // CTAs elsewhere on the page carry data-contact-mode="download" | "consult" and switch the mode.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const trigger =
        event.target instanceof Element ? event.target.closest("[data-contact-mode]") : null;
      const next = trigger?.getAttribute("data-contact-mode");
      if (next !== "download" && next !== "consult") return;
      setMode(next);
      setErrors((current) => ({ ...current, category: undefined }));
      setFormError(null);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const showSuccess = submitted !== null && submitted === mode;

  useEffect(() => {
    if (showSuccess) successHeadingRef.current?.focus();
  }, [showSuccess]);

  function changeMode(next: ContactMode) {
    setMode(next);
    setErrors((current) => ({ ...current, category: undefined }));
    setFormError(null);
  }

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    if (isField(field)) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  const fieldId = (field: Field) => `${baseId}-${field}`;
  const errorId = (field: Field) => `${baseId}-${field}-error`;

  /** id and ARIA error state shared by every control. */
  const control = (field: Field) => ({
    id: fieldId(field),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? errorId(field) : undefined,
  });

  function validate(request: Omit<ContactRequest, "elapsedMs">): FieldErrors {
    const found: FieldErrors = {};
    const tooLong = (max: number) => t("errors.tooLong", { max });

    if (!request.company) found.company = t("errors.companyRequired");
    else if (request.company.length > CONTACT_LIMITS.company)
      found.company = tooLong(CONTACT_LIMITS.company);

    if (!request.name) found.name = t("errors.nameRequired");
    else if (request.name.length > CONTACT_LIMITS.name) found.name = tooLong(CONTACT_LIMITS.name);

    if (!request.email) found.email = t("errors.emailRequired");
    else if (request.email.length > CONTACT_LIMITS.email)
      found.email = tooLong(CONTACT_LIMITS.email);
    else if (!EMAIL_PATTERN.test(request.email)) found.email = t("errors.emailInvalid");

    if (request.phone.length > CONTACT_LIMITS.phone) found.phone = tooLong(CONTACT_LIMITS.phone);
    else if (request.phone && !isPhoneNumber(request.phone)) found.phone = t("errors.phoneInvalid");

    if (request.mode === "consult" && !isConsultCategory(request.category))
      found.category = t("errors.categoryRequired");

    if (request.message.length > CONTACT_LIMITS.message)
      found.message = tooLong(CONTACT_LIMITS.message);

    if (!request.consent) found.consent = t("errors.consentRequired");
    return found;
  }

  function focusFirstError(found: FieldErrors) {
    for (const field of FIELDS) {
      const element = found[field] ? document.getElementById(fieldId(field)) : null;
      if (element) {
        element.focus();
        return;
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const request = toRequest(values, mode);
    const found = validate(request);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstError(found);
      return;
    }
    setErrors({});
    setPending(true);

    const startedAt = startedAtRef.current;
    const body: ContactRequest = {
      ...request,
      elapsedMs: startedAt === null ? 0 : Math.round(performance.now() - startedAt),
      turnstileToken: turnstileToken ?? undefined,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await response.json().catch(() => null);

      if (response.ok && isOkResponse(data)) {
        setSubmitted(mode);
        return;
      }
      setTurnstileToken(null);
      setAttempt((a) => a + 1);
      if (response.status === 400) {
        const serverErrors = readFieldErrors(data);
        // Category is hidden in download mode, so its error (like any unknown field's) goes on top.
        const visible = mode === "consult" ? FIELDS : FIELDS.filter((f) => f !== "category");
        const shown: FieldErrors = {};
        for (const field of visible) if (serverErrors[field]) shown[field] = serverErrors[field];
        const other = Object.entries(serverErrors).find(([field]) => !(field in shown));

        setErrors(shown);
        if (other || Object.keys(shown).length === 0)
          setFormError(other?.[1] ?? t("errors.generic"));
        focusFirstError(shown);
        return;
      }
      setFormError(response.status === 429 ? t("errors.rateLimited") : t("errors.generic"));
    } catch {
      setFormError(t("errors.generic"));
      setTurnstileToken(null);
      setAttempt((a) => a + 1);
    } finally {
      setPending(false);
    }
  }

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <CircleCheckIcon aria-hidden="true" className="size-6 text-primary" />
        </span>
        <h3 ref={successHeadingRef} tabIndex={-1} className="mt-4 text-xl font-bold outline-none">
          {t(`success.${mode}.title`)}
        </h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">{t(`success.${mode}.body`)}</p>
        {mode === "download" ? (
          <div className="mt-6 flex w-full flex-col items-center gap-2">
            <Button asChild size="lg" className="h-12 w-full px-6 text-base sm:w-auto">
              <a href={GUIDE_PDF_PATH} target="_blank" rel="noopener">
                <DownloadIcon aria-hidden="true" />
                {t("success.download.link")}
                <span className="sr-only">{t("newTab")}</span>
              </a>
            </Button>
            <Button type="button" variant="link" onClick={() => changeMode("consult")}>
              {t("success.download.consult")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const messageLength = values.message.trim().length;
  const counterId = `${baseId}-message-counter`;

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={pending} className="grid gap-5">
      <div>
        <p id={`${baseId}-mode`} className="text-sm font-semibold">
          {t("modeLegend")}
        </p>
        <RadioGroup
          aria-labelledby={`${baseId}-mode`}
          value={mode}
          onValueChange={(value) => {
            if (value === "download" || value === "consult") changeMode(value);
          }}
          className="mt-2 grid gap-2 sm:grid-cols-2"
        >
          {MODES.map((option) => (
            <Label
              key={option}
              htmlFor={`${baseId}-mode-${option}`}
              className="cursor-pointer items-start gap-3 rounded-xl border bg-background p-3.5 leading-snug font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60"
            >
              <RadioGroupItem id={`${baseId}-mode-${option}`} value={option} className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">{t(`modes.${option}.label`)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(`modes.${option}.hint`)}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <FormAlert error={formError ?? undefined} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <FieldLabel htmlFor={fieldId("company")} tag={t("required")} required>
            {t("company.label")}
          </FieldLabel>
          <Input
            {...control("company")}
            name="company"
            autoComplete="organization"
            maxLength={CONTACT_LIMITS.company}
            placeholder={t("company.placeholder")}
            aria-required="true"
            value={values.company}
            onChange={(event) => update("company", event.target.value)}
            className="h-10"
          />
          <FieldError id={errorId("company")} message={errors.company} />
        </div>
        <div className="grid content-start gap-2">
          <FieldLabel htmlFor={fieldId("name")} tag={t("required")} required>
            {t("name.label")}
          </FieldLabel>
          <Input
            {...control("name")}
            name="name"
            autoComplete="name"
            maxLength={CONTACT_LIMITS.name}
            placeholder={t("name.placeholder")}
            aria-required="true"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            className="h-10"
          />
          <FieldError id={errorId("name")} message={errors.name} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <FieldLabel htmlFor={fieldId("email")} tag={t("required")} required>
            {t("email.label")}
          </FieldLabel>
          <Input
            {...control("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={CONTACT_LIMITS.email}
            placeholder={t("email.placeholder")}
            aria-required="true"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            className="h-10"
          />
          <FieldError id={errorId("email")} message={errors.email} />
        </div>
        <div className="grid content-start gap-2">
          <FieldLabel htmlFor={fieldId("phone")} tag={t("optional")}>
            {t("phone.label")}
          </FieldLabel>
          <Input
            {...control("phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={CONTACT_LIMITS.phone}
            placeholder={t("phone.placeholder")}
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
            className="h-10"
          />
          <FieldError id={errorId("phone")} message={errors.phone} />
        </div>
      </div>

      {mode === "consult" ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor={fieldId("category")} tag={t("required")} required>
            {t("category.label")}
          </FieldLabel>
          <Select value={values.category} onValueChange={(value) => update("category", value)}>
            <SelectTrigger
              {...control("category")}
              aria-required="true"
              className="w-full data-[size=default]:h-10"
            >
              <SelectValue placeholder={t("category.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {CONSULT_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {t(`category.options.${category}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={errorId("category")} message={errors.category} />
        </div>
      ) : null}

      <div className="grid gap-2">
        <FieldLabel htmlFor={fieldId("message")} tag={t("optional")}>
          {t("message.label")}
        </FieldLabel>
        <Textarea
          {...control("message")}
          aria-describedby={errors.message ? `${errorId("message")} ${counterId}` : counterId}
          name="message"
          rows={5}
          placeholder={t("message.placeholder")}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          className="min-h-32"
        />
        <div className="flex items-start justify-between gap-3">
          <FieldError id={errorId("message")} message={errors.message} />
          <p
            id={counterId}
            className={cn(
              "ml-auto shrink-0 text-xs tabular-nums",
              messageLength > CONTACT_LIMITS.message ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {t("message.counter", { count: messageLength, max: CONTACT_LIMITS.message })}
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-start gap-3">
          <Checkbox
            {...control("consent")}
            checked={values.consent}
            onCheckedChange={(checked) => update("consent", checked === true)}
            aria-required="true"
            className="mt-0.5"
          />
          <Label htmlFor={fieldId("consent")} className="block leading-relaxed font-normal">
            {t.rich("consent", {
              link: (chunks: ReactNode) => (
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {chunks}
                  <span className="sr-only">{t("newTab")}</span>
                </Link>
              ),
            })}
            <RequiredTag label={t("required")} className="ml-2" />
          </Label>
        </div>
        <FieldError id={errorId("consent")} message={errors.consent} />
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots that fill it get filtered server-side. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor={`${baseId}-website`}>{t("honeypot")}</label>
        <input
          id={`${baseId}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
        />
      </div>

      <Turnstile key={attempt} action="contact" onToken={setTurnstileToken} />
      <Button
        type="submit"
        size="lg"
        disabled={pending || (turnstileSiteKey !== null && !turnstileToken)}
        className="h-12 w-full text-base"
      >
        {pending ? (
          <>
            <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
            {t("submitting")}
          </>
        ) : (
          t(`submit.${mode}`)
        )}
      </Button>
    </form>
  );
}

function RequiredTag({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-destructive",
        className,
      )}
    >
      {label}
    </span>
  );
}

function FieldLabel({
  htmlFor,
  tag,
  required = false,
  children,
}: {
  htmlFor: string;
  tag: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="font-semibold">
      {children}
      {required ? (
        <RequiredTag label={tag} />
      ) : (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] leading-none font-semibold text-muted-foreground">
          {tag}
        </span>
      )}
    </Label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
