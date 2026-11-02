import type { Metadata } from "next";
import { DRAFT_PAGES } from "../_components/site-config";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LegalSection, PageShell, richText } from "../_components/page-shell";

// Draft for counsel review (APPI). Operator details are placeholders in Site.operator.
const SECTIONS_BEFORE_PROVIDERS = [
  "collect",
  "purposes",
  "candidates",
  "ai",
  "thirdParty",
] as const;
const SECTIONS_AFTER_PROVIDERS = [
  "retention",
  "security",
  "requests",
  "cookies",
  "changes",
  "contact",
] as const;
const PROVIDERS = ["anthropic", "supabase", "vercel", "inngest", "resend", "sentry"] as const;

type BodySection =
  (typeof SECTIONS_BEFORE_PROVIDERS)[number] | (typeof SECTIONS_AFTER_PROVIDERS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PrivacyPolicy.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/privacy" },
    ...(DRAFT_PAGES.includes("/privacy") ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("PrivacyPolicy");
  const tOperator = await getTranslations("Site.operator");
  const operator = {
    company: tOperator("name"),
    address: tOperator("address"),
    representative: tOperator("representative"),
    email: tOperator("email"),
  };

  const body = (key: BodySection) => t.rich(`sections.${key}.body`, { ...richText, ...operator });

  const providers = (
    <>
      {t.rich("sections.foreign.intro", richText)}
      <div className="my-4 overflow-hidden rounded-xl border">
        <table className="w-full border-collapse text-left text-sm leading-6">
          <caption className="sr-only">{t("sections.foreign.table.caption")}</caption>
          <thead className="bg-muted/60 text-xs">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("sections.foreign.table.provider")}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("sections.foreign.table.country")}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("sections.foreign.table.purpose")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {PROVIDERS.map((provider) => (
              <tr key={provider}>
                <th scope="row" className="px-3 py-2.5 align-top font-semibold">
                  {t(`sections.foreign.providers.${provider}.name`)}
                </th>
                <td className="px-3 py-2.5 align-top">
                  {t(`sections.foreign.providers.${provider}.country`)}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {t(`sections.foreign.providers.${provider}.purpose`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.rich("sections.foreign.after", richText)}
    </>
  );

  const sections: { key: BodySection | "foreign"; content: ReactNode }[] = [
    ...SECTIONS_BEFORE_PROVIDERS.map((key) => ({ key, content: body(key) })),
    { key: "foreign", content: providers },
    ...SECTIONS_AFTER_PROVIDERS.map((key) => ({ key, content: body(key) })),
  ];

  return (
    <PageShell
      draft
      title={t("title")}
      intro={<p>{t("intro", { company: operator.company })}</p>}
      toc={sections.map(({ key }) => ({
        id: `privacy-${key}`,
        title: t(`sections.${key}.title`),
      }))}
    >
      <div className="space-y-10 rounded-2xl border bg-card p-5 sm:p-8">
        {sections.map(({ key, content }) => (
          <LegalSection key={key} id={`privacy-${key}`} title={t(`sections.${key}.title`)}>
            {content}
          </LegalSection>
        ))}
        <p className="text-right text-sm text-muted-foreground">{t("established")}</p>
      </div>
    </PageShell>
  );
}
