import { SmartphoneIcon, TimerIcon, UserRoundXIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CandidateScreen, type CandidateStep } from "./mockups";
import { Section } from "./primitives";

const BADGES = [
  { key: "noApp", icon: <SmartphoneIcon /> },
  { key: "noSignup", icon: <UserRoundXIcon /> },
  { key: "time", icon: <TimerIcon /> },
] as const;

const STEPS: readonly CandidateStep[] = ["entry", "result", "booking", "confirmed"];

/** What the candidate sees: no app, no sign-up, about three minutes on a phone. */
export async function CandidateExperience() {
  const t = await getTranslations("Home.candidate");

  return (
    <Section
      id="candidate"
      tone="accent"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <ul className="mt-8 flex flex-wrap justify-center gap-2">
        {BADGES.map((badge) => (
          <li
            key={badge.key}
            className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-background px-3 py-1.5 text-sm font-semibold text-primary [&_svg]:size-4"
          >
            {badge.icon}
            {t(`badges.${badge.key}`)}
          </li>
        ))}
      </ul>
      <ol className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step} className="flex flex-col">
            {/* The caption below says what the screen shows. */}
            <div aria-hidden="true">
              <CandidateScreen step={step} />
            </div>
            <p className="mt-5 text-xs font-semibold text-primary">
              {t("stepLabel", { step: index + 1 })}
            </p>
            <h3 className="mt-1 font-bold">{t(`steps.${step}.title`)}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t(`steps.${step}.body`)}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
