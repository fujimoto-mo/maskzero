import { ChevronRightIcon, CircleCheckIcon, ClockIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InterviewMock, SchedulingMock, ScreeningMock } from "./mockups";
import { Container, type SectionTone, StatusBadge, stepNumber } from "./primitives";

type Actor = "human" | "ai";

const FLOW_KEYS = ["a", "b", "c", "d"] as const;
const SCREENING_FLOW: readonly Actor[] = ["human", "ai", "ai", "human"];
const SCHEDULING_FLOW: readonly Actor[] = ["human", "ai", "ai", "human"];
const INTERVIEW_FLOW: readonly Actor[] = ["ai", "human", "ai", "human"];

const SCREENING_POINTS = ["criteria", "verdicts", "evidence", "photos", "fairness"] as const;
const SCHEDULING_POINTS = ["availability", "choices", "reminders", "calendar"] as const;
const INTERVIEW_POINTS = ["prep", "notes", "decision"] as const;

type FlowStep = { actor: Actor; label: string };
type Point = { text: string; pending?: boolean };

function FeatureDetail({
  id,
  index,
  eyebrow,
  title,
  lead,
  status,
  flowLabel,
  actorLabels,
  flow,
  points,
  mock,
  tone,
  reverse = false,
}: {
  id: string;
  index: number;
  eyebrow: string;
  title: string;
  lead: string;
  status: string;
  flowLabel: string;
  actorLabels: Record<Actor, string>;
  flow: FlowStep[];
  points: Point[];
  mock: ReactNode;
  tone: SectionTone;
  reverse?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-16 py-16 sm:py-20", tone === "muted" && "bg-muted/40")}
    >
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className={cn(reverse && "lg:order-2")}>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
            <span className="tabular-nums">{stepNumber(index)}</span>
            <span>{eyebrow}</span>
            <StatusBadge label={status} />
          </p>
          <h2
            id={`${id}-title`}
            className="mt-3 text-2xl leading-snug font-bold tracking-tight text-balance [word-break:auto-phrase] sm:text-3xl"
          >
            {title}
          </h2>
          <p className="mt-4 leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            {lead}
          </p>

          <ol aria-label={flowLabel} className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {flow.map((step, stepIndex) => (
              <li key={stepIndex} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-xs font-medium",
                    step.actor === "ai"
                      ? "border-primary/30 bg-accent text-accent-foreground"
                      : "bg-background",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[10px] font-bold",
                      step.actor === "ai"
                        ? "bg-primary text-primary-foreground"
                        : "bg-foreground text-background",
                    )}
                  >
                    {actorLabels[step.actor]}
                  </span>
                  {step.label}
                </span>
                {stepIndex < flow.length - 1 ? (
                  <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                ) : null}
              </li>
            ))}
          </ol>

          <ul className="mt-7 space-y-3">
            {points.map((point) => (
              <li
                key={point.text}
                className={cn(
                  "flex gap-3 leading-relaxed",
                  point.pending && "text-muted-foreground",
                )}
              >
                {point.pending ? (
                  <ClockIcon aria-hidden="true" className="mt-1 size-4.5 shrink-0" />
                ) : (
                  <CircleCheckIcon
                    aria-hidden="true"
                    className="mt-1 size-4.5 shrink-0 text-primary"
                  />
                )}
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(reverse && "lg:order-1")}>{mock}</div>
      </Container>
    </section>
  );
}

/** The three feature-detail sections: screening, scheduling, interviews. */
export async function FeatureDetails() {
  const t = await getTranslations("Home.features");
  const actorLabels = { human: t("actors.human"), ai: t("actors.ai") };

  return (
    <>
      <FeatureDetail
        id="feature-screening"
        index={0}
        tone="muted"
        eyebrow={t("screening.eyebrow")}
        title={t("screening.title")}
        lead={t("screening.lead")}
        status={t("screening.status")}
        flowLabel={t("flowLabel")}
        actorLabels={actorLabels}
        flow={FLOW_KEYS.map((key, i) => ({
          actor: SCREENING_FLOW[i],
          label: t(`screening.flow.${key}`),
        }))}
        points={SCREENING_POINTS.map((key) => ({ text: t(`screening.points.${key}`) }))}
        mock={<ScreeningMock />}
      />
      <FeatureDetail
        id="feature-scheduling"
        index={1}
        tone="plain"
        reverse
        eyebrow={t("scheduling.eyebrow")}
        title={t("scheduling.title")}
        lead={t("scheduling.lead")}
        status={t("scheduling.status")}
        flowLabel={t("flowLabel")}
        actorLabels={actorLabels}
        flow={FLOW_KEYS.map((key, i) => ({
          actor: SCHEDULING_FLOW[i],
          label: t(`scheduling.flow.${key}`),
        }))}
        points={SCHEDULING_POINTS.map((key) => ({ text: t(`scheduling.points.${key}`) }))}
        mock={<SchedulingMock />}
      />
      <FeatureDetail
        id="feature-interview"
        index={2}
        tone="muted"
        eyebrow={t("interview.eyebrow")}
        title={t("interview.title")}
        lead={t("interview.lead")}
        status={t("interview.status")}
        flowLabel={t("flowLabel")}
        actorLabels={actorLabels}
        flow={FLOW_KEYS.map((key, i) => ({
          actor: INTERVIEW_FLOW[i],
          label: t(`interview.flow.${key}`),
        }))}
        points={[
          ...INTERVIEW_POINTS.map((key) => ({ text: t(`interview.points.${key}`) })),
          { text: t("interview.points.aiInterviewer"), pending: true },
        ]}
        mock={<InterviewMock />}
      />
    </>
  );
}
