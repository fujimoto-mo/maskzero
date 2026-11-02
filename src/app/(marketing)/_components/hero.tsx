import { CalendarCheckIcon, FileSearchIcon, MessagesSquareIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CtaButtons } from "./cta-buttons";
import { HeroMock } from "./mockups";
import { Container, stepNumber } from "./primitives";

const POINTS = [
  { key: "screening", icon: <FileSearchIcon /> },
  { key: "scheduling", icon: <CalendarCheckIcon /> },
  { key: "interview", icon: <MessagesSquareIcon /> },
] as const;

export async function Hero() {
  const t = await getTranslations("Home.hero");

  return (
    <section id="top" aria-labelledby="top-title" className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-b from-accent via-accent/40 to-background"
      />
      <div
        aria-hidden="true"
        className="absolute -top-40 -right-40 -z-10 size-[32rem] rounded-full bg-primary/10 blur-3xl"
      />
      <Container className="grid items-center gap-12 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-24">
        <div>
          <p className="inline-flex rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-semibold text-primary sm:text-sm">
            {t("eyebrow")}
          </p>
          <h1
            id="top-title"
            className="mt-5 text-[2rem] leading-[1.3] font-bold tracking-tight text-balance [word-break:auto-phrase] sm:text-5xl sm:leading-[1.2]"
          >
            {t("title")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            {t("lead")}
          </p>

          <ol aria-label={t("pointsLabel")} className="mt-8 grid gap-3 sm:grid-cols-3">
            {POINTS.map((point, index) => (
              <li
                key={point.key}
                className="flex items-start gap-3 rounded-xl border bg-background/80 p-3 sm:flex-col sm:gap-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-4.5">
                  {point.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">
                    <span className="mr-1.5 text-primary tabular-nums">{stepNumber(index)}</span>
                    {t(`points.${point.key}.title`)}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                    {t(`points.${point.key}.body`)}
                  </span>
                  {point.key === "interview" ? (
                    <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t("points.interview.badge")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>

          <CtaButtons className="mt-8" />
          <p className="mt-4 text-sm text-muted-foreground">{t("note")}</p>
        </div>

        <HeroMock label={t("visualLabel")} />
      </Container>
    </section>
  );
}
