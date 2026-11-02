import { ClockIcon, ScaleIcon, UserRoundXIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section } from "./primitives";

// Assumptions behind the estimate (shown under the chart).
const APPLICATIONS = 100;
const PASS_RATE_PERCENT = 35;
const SCHEDULING_ROUNDS = 3;
const MESSAGES_PER_BOOKING = 2;
const CLIENTS = 10;

const PASSED = Math.round((APPLICATIONS * PASS_RATE_PERCENT) / 100);

const ROWS = [
  { key: "read", count: APPLICATIONS },
  { key: "notify", count: APPLICATIONS },
  { key: "schedule", count: PASSED * SCHEDULING_ROUNDS },
  { key: "remind", count: PASSED * MESSAGES_PER_BOOKING },
] as const;

const TOTAL = ROWS.reduce((sum, row) => sum + row.count, 0);
const MAX = Math.max(...ROWS.map((row) => row.count));

const EFFECTS = [
  { key: "cost", icon: <ScaleIcon /> },
  { key: "speed", icon: <ClockIcon /> },
  { key: "consistency", icon: <UserRoundXIcon /> },
] as const;

export async function Workload() {
  const t = await getTranslations("Home.workload");

  const notes: Partial<Record<(typeof ROWS)[number]["key"], string>> = {
    schedule: t("notes.schedule", { passed: PASSED, rounds: SCHEDULING_ROUNDS }),
    remind: t("notes.remind", { passed: PASSED, perPerson: MESSAGES_PER_BOOKING }),
  };

  return (
    <Section
      id="workload"
      tone="muted"
      eyebrow={t("eyebrow")}
      title={t("title", { applications: APPLICATIONS, total: TOTAL })}
      lead={t("lead", { applications: APPLICATIONS })}
    >
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <figure className="rounded-2xl border bg-card p-5 sm:p-7">
          <figcaption className="text-sm font-semibold text-muted-foreground">
            {t("chartLabel")}
          </figcaption>
          <ul className="mt-6 space-y-5">
            {ROWS.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-medium">{t(`rows.${row.key}`)}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {t("count", { count: row.count })}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${(row.count / MAX) * 100}%` }}
                  />
                </div>
                {notes[row.key] ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{notes[row.key]}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex items-baseline justify-between gap-4 border-t pt-5">
            <span className="font-semibold">{t("totalLabel")}</span>
            <span className="text-3xl font-bold text-primary tabular-nums sm:text-4xl">
              {t("count", { count: TOTAL })}
            </span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("assumption", { passRate: PASS_RATE_PERCENT, rounds: SCHEDULING_ROUNDS })}
          </p>
        </figure>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-primary p-6 text-primary-foreground sm:p-7">
            <p className="text-sm font-medium text-primary-foreground/80">
              {t("scaleLabel", { clients: CLIENTS })}
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums sm:text-5xl">
              {t("scaleValue", { count: TOTAL * CLIENTS })}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5 sm:p-7">
            <h3 className="font-bold">{t("effectsTitle")}</h3>
            <ul className="mt-4 space-y-4">
              {EFFECTS.map((effect) => (
                <li key={effect.key} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive [&_svg]:size-4.5">
                    {effect.icon}
                  </span>
                  <span>
                    <span className="block font-semibold">{t(`effects.${effect.key}.title`)}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {t(`effects.${effect.key}.body`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
