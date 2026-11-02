import {
  CalendarCheckIcon,
  FileSearchIcon,
  MessagesSquareIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section, StatusBadge, stepNumber } from "./primitives";

const STEPS = [
  { key: "screening", icon: <FileSearchIcon /> },
  { key: "scheduling", icon: <CalendarCheckIcon /> },
  { key: "interview", icon: <MessagesSquareIcon /> },
] as const;

/** "What you do / what AI does" for the three steps (anchor: できること). */
export async function Steps() {
  const t = await getTranslations("Home.steps");

  return (
    <Section id="features" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")}>
      <ol className="mt-12 grid gap-5 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.key} className="flex flex-col rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground [&_svg]:size-5">
                {step.icon}
              </span>
              <h3 className="text-lg font-bold">
                <span className="mr-2 text-sm text-primary tabular-nums">{stepNumber(index)}</span>
                {t(`items.${step.key}.title`)}
              </h3>
              <StatusBadge label={t(`items.${step.key}.status`)} className="ml-auto" />
            </div>
            <div className="mt-5 grid flex-1 gap-3">
              <div className="rounded-xl bg-muted/70 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <UserRoundIcon className="size-3.5" />
                  {t("youLabel")}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{t(`items.${step.key}.you`)}</p>
              </div>
              <div className="rounded-xl bg-accent p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <SparklesIcon className="size-3.5" />
                  {t("aiLabel")}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-accent-foreground">
                  {t(`items.${step.key}.ai`)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-muted-foreground">
        {t("availability")}
      </p>
    </Section>
  );
}
