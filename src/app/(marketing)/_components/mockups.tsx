// Product visuals built from HTML and CSS (there are no image assets). Each mock-up is either
// labelled as a single image (role="img") or hidden from assistive tech when a caption says the same.
import {
  BellIcon,
  BotIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FileTextIcon,
  MailIcon,
  QuoteIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrowserFrame({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/10",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b bg-muted/60 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-muted-foreground">
          {title}
        </span>
        <span className="w-10" />
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto w-full rounded-[1.75rem] border-[5px] border-foreground/80 bg-background p-1 shadow-xl shadow-primary/10",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.35rem] bg-background">
        <div className="mx-auto mt-1.5 h-1 w-10 rounded-full bg-foreground/15" />
        {children}
      </div>
    </div>
  );
}

type Verdict = "pass" | "check" | "failPending";

const verdictClasses: Record<Verdict, string> = {
  pass: "bg-primary/10 text-primary",
  check: "bg-chart-4/25 text-foreground",
  failPending: "bg-destructive/10 text-destructive",
};

function VerdictBadge({ kind, children }: { kind: Verdict; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        verdictClasses[kind],
      )}
    >
      {children}
    </span>
  );
}

function ScoreBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
    </span>
  );
}

const HERO_ROWS = [
  { key: "a", score: 86, verdict: "pass" },
  { key: "b", score: 64, verdict: "check" },
  { key: "c", score: 41, verdict: "failPending" },
] as const;

const HERO_ACTIVITY = [
  { key: "read", count: 24, icon: <FileTextIcon /> },
  { key: "invited", count: 9, icon: <SendIcon /> },
  { key: "booked", count: 6, icon: <CalendarCheckIcon /> },
] as const;

/** Hero visual: the screening list, one quoted reason, and today's AI activity. */
export async function HeroMock({ label }: { label: string }) {
  const t = await getTranslations("Home.mock");

  return (
    <div role="img" aria-label={label} className="relative mx-auto w-full max-w-lg">
      <BrowserFrame title={t("windowTitle")}>
        {/* Extra bottom padding on larger screens leaves room for the overlapping activity card. */}
        <div className="space-y-3 p-3 sm:p-4 sm:pb-14">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              {t("jobLabel")}
              <span className="ml-2 font-medium text-foreground">{t("jobName")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-primary/50 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {t("reading")}
            </span>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-background">
            {HERO_ROWS.map((row) => {
              const name = t(`rows.${row.key}.name`);
              return (
                <li key={row.key} className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {row.verdict === "failPending" ? t("pendingNote") : t(`rows.${row.key}.meta`)}
                    </span>
                  </span>
                  <span className="hidden w-16 sm:block">
                    <ScoreBar value={row.score} />
                  </span>
                  <span className="w-6 text-right text-sm font-semibold tabular-nums">
                    {row.score}
                  </span>
                  <VerdictBadge kind={row.verdict}>{t(`verdicts.${row.verdict}`)}</VerdictBadge>
                </li>
              );
            })}
          </ul>
          <div className="rounded-xl border border-primary/20 bg-accent/60 p-3">
            <p className="text-[11px] font-semibold text-primary">{t("evidenceTitle")}</p>
            <p className="mt-1 text-xs font-medium">{t("evidenceCriterion")}</p>
            <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-accent-foreground">
              <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {t("evidenceQuote")}
            </p>
          </div>
        </div>
      </BrowserFrame>

      <div className="relative mt-4 rounded-xl border bg-card p-4 shadow-lg shadow-primary/10 sm:-mt-11 sm:-ml-6 sm:w-60">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <SparklesIcon className="size-3.5 text-primary" />
          {t("activityTitle")}
        </p>
        <ul className="mt-3 space-y-2">
          {HERO_ACTIVITY.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-3.5">
                {item.icon}
                {t(`activity.${item.key}`)}
              </span>
              <span className="font-semibold tabular-nums">
                {t("count", { count: item.count })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SCREENING_CRITERIA = [
  { key: "a", result: "met", required: true },
  { key: "b", result: "met", required: false },
  { key: "c", result: "partial", required: false },
] as const;

/** Feature 01: one candidate's verdict with a quote per criterion. */
export async function ScreeningMock() {
  const t = await getTranslations("Home.features.screening.mock");
  const tHero = await getTranslations("Home.mock");
  const score = 86;

  return (
    <div role="img" aria-label={t("label")} className="mx-auto w-full max-w-lg">
      <BrowserFrame title={tHero("windowTitle")}>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{t("candidate")}</p>
              <p className="truncate text-xs text-muted-foreground">{t("job")}</p>
            </div>
            <VerdictBadge kind="pass">{t("verdict")}</VerdictBadge>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t("scoreLabel")}</span>
            <ScoreBar value={score} className="flex-1" />
            <span className="text-lg font-bold tabular-nums">{score}</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {SCREENING_CRITERIA.map((criterion) => (
              <li key={criterion.key} className="rounded-xl border bg-background p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {criterion.result === "met" ? (
                    <CircleCheckIcon className="size-4 shrink-0 text-primary" />
                  ) : (
                    <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium">{t(`criteria.${criterion.key}.name`)}</span>
                  {criterion.required ? (
                    <span className="rounded bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                      {t("required")}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "ml-auto text-xs font-semibold",
                      criterion.result === "met" ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {t(`results.${criterion.result}`)}
                  </span>
                </div>
                <p className="mt-2 flex gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-xs leading-relaxed text-accent-foreground">
                  <QuoteIcon className="mt-0.5 size-3 shrink-0 text-primary" />
                  {t(`criteria.${criterion.key}.quote`)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 shrink-0 text-primary" />
            {t("verified")}
          </p>
        </div>
      </BrowserFrame>
    </div>
  );
}

const BOOKING_DAYS = ["a", "b"] as const;
const BOOKING_SLOTS = ["a", "b", "c"] as const;
/** Preference rank per day and slot in the booking mock-up. */
const BOOKING_PICKS: Record<(typeof BOOKING_DAYS)[number], Partial<Record<string, number>>> = {
  a: { b: 1 },
  b: { a: 2, c: 3 },
};

/** Feature 02: the candidate's booking page and the confirmation that follows. */
export async function SchedulingMock() {
  const t = await getTranslations("Home.features.scheduling.mock");

  return (
    <div role="img" aria-label={t("label")} className="relative mx-auto w-full max-w-sm">
      <PhoneFrame className="max-w-[17.5rem]">
        {/* Extra bottom padding on larger screens leaves room for the overlapping notification. */}
        <div className="space-y-3 p-4 text-xs sm:pb-10">
          <div>
            <p className="text-[11px] text-muted-foreground">{t("company")}</p>
            <p className="text-sm font-semibold">{t("title")}</p>
          </div>
          <p className="text-muted-foreground">{t("instruction")}</p>
          {BOOKING_DAYS.map((day) => (
            <div key={day}>
              <p className="font-medium">{t(`days.${day}`)}</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5 pt-1">
                {BOOKING_SLOTS.map((slot) => {
                  const rank = BOOKING_PICKS[day][slot];
                  return (
                    <span
                      key={slot}
                      className={cn(
                        "relative rounded-md border py-1.5 text-center tabular-nums",
                        rank
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background",
                      )}
                    >
                      {t(`slots.${slot}`)}
                      {rank ? (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-background px-1.5 text-[9px] leading-4 font-semibold whitespace-nowrap text-primary ring-1 ring-primary/40">
                          {t("picked", { rank })}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          <span className="block rounded-lg bg-primary py-2 text-center font-semibold text-primary-foreground">
            {t("submit")}
          </span>
        </div>
      </PhoneFrame>
      <div className="relative mx-auto mt-4 max-w-[17.5rem] rounded-xl border bg-card p-3 shadow-lg shadow-primary/10 sm:-mt-8 sm:mr-0 sm:w-60">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <CalendarCheckIcon className="size-4 shrink-0 text-primary" />
          {t("confirmed")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{t("confirmedDetail")}</p>
      </div>
    </div>
  );
}

const INTERVIEW_HIGHLIGHTS = ["a", "b"] as const;
const INTERVIEW_QUESTIONS = ["a", "b", "c"] as const;

/** Feature 03: interview prep with document highlights and suggested questions. */
export async function InterviewMock() {
  const t = await getTranslations("Home.features");

  return (
    <div role="img" aria-label={t("interview.mock.label")} className="mx-auto w-full max-w-lg">
      <BrowserFrame title={t("interview.mock.title")}>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{t("screening.mock.candidate")}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
              {t("interview.mock.round")}
            </span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">
              {t("interview.mock.highlightsTitle")}
            </p>
            <ul className="mt-1.5 space-y-1 text-xs">
              {INTERVIEW_HIGHLIGHTS.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/40" />
                  {t(`interview.mock.highlights.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <SparklesIcon className="size-3.5" />
              {t("interview.mock.questionsTitle")}
            </p>
            <ol className="mt-2 space-y-2">
              {INTERVIEW_QUESTIONS.map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-2 rounded-xl border bg-background p-2.5 text-xs leading-relaxed"
                >
                  <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    {t(`interview.mock.questions.${key}.tag`)}
                  </span>
                  <span>{t(`interview.mock.questions.${key}.text`)}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="flex items-center gap-2 rounded-xl border border-dashed p-2.5 text-xs text-muted-foreground">
            <BotIcon className="size-4 shrink-0" />
            {t("interview.mock.aiInterviewerBadge")}
          </p>
        </div>
      </BrowserFrame>
    </div>
  );
}

export type CandidateStep = "entry" | "result" | "booking" | "confirmed";

/** Days shown in the booking mock-up calendar; `true` marks days with free slots. */
const CALENDAR_DAYS = Array.from({ length: 14 }, (_, index) => ({
  day: 10 + index,
  open: [2, 3, 4, 7, 9, 10].includes(index),
}));
const PICKED_DAY = 12;

function FieldMock({ label }: { label: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className="mt-1 h-6 rounded-md border bg-background" />
    </div>
  );
}

function ButtonMock({ children }: { children: ReactNode }) {
  return (
    <span className="mt-auto block rounded-md bg-primary py-1.5 text-center font-semibold text-primary-foreground">
      {children}
    </span>
  );
}

/** One of the four phone screens in the candidate-experience section (decorative). */
export async function CandidateScreen({ step }: { step: CandidateStep }) {
  const t = await getTranslations("Home.candidate.screens");

  let content: ReactNode;
  if (step === "entry") {
    content = (
      <>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold sm:text-xs">{t("entry.heading")}</p>
          <span className="text-muted-foreground tabular-nums">{t("entry.progress")}</span>
        </div>
        <div className="h-1 rounded-full bg-muted">
          <div className="h-full w-1/2 rounded-full bg-primary" />
        </div>
        <FieldMock label={t("entry.name")} />
        <FieldMock label={t("entry.phone")} />
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-primary/40 bg-accent/40 px-2 py-2.5 text-center">
          <UploadIcon className="size-4 text-primary" />
          <span className="font-medium">{t("entry.upload")}</span>
          <span className="text-muted-foreground">{t("entry.uploadHint")}</span>
        </div>
        <ButtonMock>{t("entry.next")}</ButtonMock>
      </>
    );
  } else if (step === "result") {
    content = (
      <>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold sm:text-xs">
          <MailIcon className="size-3.5 shrink-0 text-primary" />
          {t("result.heading")}
        </p>
        <div className="space-y-1.5 rounded-lg border bg-background p-2.5">
          <p>{t("result.body")}</p>
          <div className="h-1.5 w-full rounded bg-muted" />
          <div className="h-1.5 w-4/5 rounded bg-muted" />
          <div className="h-1.5 w-3/5 rounded bg-muted" />
        </div>
        <ButtonMock>{t("result.button")}</ButtonMock>
      </>
    );
  } else if (step === "booking") {
    content = (
      <>
        <p className="text-[11px] font-semibold sm:text-xs">{t("booking.heading")}</p>
        <div className="grid grid-cols-7 gap-0.5 text-center tabular-nums">
          {CALENDAR_DAYS.map(({ day, open }) => (
            <span
              key={day}
              className={cn(
                "rounded py-0.5",
                day === PICKED_DAY
                  ? "bg-primary font-semibold text-primary-foreground"
                  : open
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              {day}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-1 rounded-md border border-primary bg-accent/60 px-2 py-1.5">
          <span className="font-medium tabular-nums">{t("booking.slot")}</span>
          <span className="shrink-0 font-semibold text-primary">{t("booking.picked")}</span>
        </div>
        <ButtonMock>{t("booking.submit")}</ButtonMock>
      </>
    );
  } else {
    content = (
      <>
        <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/10">
            <CalendarCheckIcon className="size-5 text-primary" />
          </span>
          <p className="text-[11px] font-semibold sm:text-xs">{t("confirmed.heading")}</p>
        </div>
        <div className="rounded-lg border bg-background p-2.5">
          <p className="font-semibold tabular-nums">{t("confirmed.detail")}</p>
          <p className="mt-0.5 text-muted-foreground">{t("confirmed.method")}</p>
        </div>
        <p className="mt-auto flex items-start gap-1 text-muted-foreground">
          <BellIcon className="mt-0.5 size-3 shrink-0" />
          {t("confirmed.reminder")}
        </p>
      </>
    );
  }

  return (
    <PhoneFrame className="max-w-[11.5rem]">
      <div className="flex min-h-[17.5rem] flex-col gap-2.5 p-3 text-[10px] leading-snug sm:text-[11px]">
        {content}
      </div>
    </PhoneFrame>
  );
}
