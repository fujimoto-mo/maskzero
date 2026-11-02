import { CheckIcon, UserRoundCheckIcon, XIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section } from "./primitives";

const ITEMS = ["read", "notify", "schedule", "remind", "notes", "clients"] as const;
const HUMAN_ITEMS = ["criteria", "availability", "decision"] as const;

/** Before / after comparison (anchor: 導入後の変化). */
export async function BeforeAfter() {
  const t = await getTranslations("Home.change");

  return (
    <Section id="change" eyebrow={t("eyebrow")} title={t("title")}>
      <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border bg-card">
        <div
          aria-hidden="true"
          className="hidden grid-cols-2 border-b text-sm font-semibold md:grid"
        >
          <p className="bg-muted/50 px-6 py-3 text-muted-foreground">{t("beforeLabel")}</p>
          <p className="border-l bg-accent/60 px-6 py-3 text-primary">{t("afterLabel")}</p>
        </div>
        <ul className="divide-y">
          {ITEMS.map((key) => (
            <li key={key} className="grid md:grid-cols-2">
              <div className="flex gap-3 px-5 pt-4 md:px-6 md:py-4">
                <XIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <p className="text-sm text-muted-foreground">
                  <span className="block text-xs font-semibold md:sr-only">{t("beforeLabel")}</span>
                  {t(`items.${key}.before`)}
                </p>
              </div>
              <div className="flex gap-3 px-5 pt-2 pb-4 md:border-l md:bg-accent/30 md:px-6 md:py-4">
                <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm font-medium">
                  <span className="block text-xs font-semibold text-primary md:sr-only">
                    {t("afterLabel")}
                  </span>
                  {t(`items.${key}.after`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-primary/20 bg-accent/50 p-6 text-center">
        <h3 className="text-sm font-semibold text-primary">{t("humanTitle")}</h3>
        <ul className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
          {HUMAN_ITEMS.map((key) => (
            <li key={key} className="flex items-center gap-2 font-bold">
              <UserRoundCheckIcon aria-hidden="true" className="size-5 text-primary" />
              {t(`humanItems.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
