import { BriefcaseIcon, BuildingIcon, CheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section } from "./primitives";

const AUDIENCES = [
  { key: "agency", icon: <BriefcaseIcon /> },
  { key: "inhouse", icon: <BuildingIcon /> },
] as const;
const POINT_KEYS = ["a", "b", "c"] as const;

/** Who it's for: recruitment agencies and in-house HR teams. */
export async function Audiences() {
  const t = await getTranslations("Home.audiences");

  return (
    <Section id="audiences" eyebrow={t("eyebrow")} title={t("title")}>
      <ul className="mt-12 grid gap-5 lg:grid-cols-2">
        {AUDIENCES.map((audience) => (
          <li key={audience.key} className="flex flex-col rounded-2xl border bg-card p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground [&_svg]:size-5">
                {audience.icon}
              </span>
              <h3 className="text-lg font-bold">{t(`${audience.key}.title`)}</h3>
            </div>
            <ul className="mt-6 space-y-3">
              {POINT_KEYS.map((key) => (
                <li key={key} className="flex gap-3 leading-relaxed">
                  <CheckIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                  {t(`${audience.key}.points.${key}`)}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <div className="rounded-xl bg-accent p-4">
                <p className="text-xs font-semibold text-primary">{t("outcomeLabel")}</p>
                <p className="mt-1 font-bold text-accent-foreground">
                  {t(`${audience.key}.outcome`)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
