import { ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section } from "./primitives";

const FLOW = ["consult", "setup", "pilot", "expand"] as const;

/** Getting started with one client and one job (anchor: 導入の流れ). */
export async function GettingStarted() {
  const t = await getTranslations("Home.flow");

  return (
    <Section id="flow" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")}>
      <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FLOW.map((key, index) => (
          <li key={key} className="relative rounded-2xl border bg-card p-5 sm:p-6">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
              {index + 1}
            </span>
            <h3 className="mt-4 font-bold">{t(`steps.${key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`steps.${key}.body`)}
            </p>
            {index < FLOW.length - 1 ? (
              <ChevronRightIcon
                aria-hidden="true"
                className="absolute top-1/2 -right-5 hidden size-5 -translate-y-1/2 text-primary/50 lg:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
