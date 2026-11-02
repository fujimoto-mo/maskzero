import type { Metadata } from "next";
import { DRAFT_PAGES } from "../_components/site-config";
import { getTranslations } from "next-intl/server";
import { LegalSection, PageShell, richText } from "../_components/page-shell";

// Draft for counsel review. Operator details are placeholders in Site.operator.
const ARTICLES = [
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "a8",
  "a9",
  "a10",
  "a11",
  "a12",
  "a13",
  "a14",
  "a15",
  "a16",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("TermsOfService.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/terms" },
    ...(DRAFT_PAGES.includes("/terms") ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function TermsPage() {
  const t = await getTranslations("TermsOfService");
  const tOperator = await getTranslations("Site.operator");

  return (
    <PageShell
      draft
      title={t("title")}
      intro={<p>{t("intro", { company: tOperator("name") })}</p>}
      toc={ARTICLES.map((key) => ({ id: `terms-${key}`, title: t(`articles.${key}.title`) }))}
    >
      <div className="space-y-10 rounded-2xl border bg-card p-5 sm:p-8">
        {ARTICLES.map((key) => (
          <LegalSection key={key} id={`terms-${key}`} title={t(`articles.${key}.title`)}>
            {t.rich(`articles.${key}.body`, richText)}
          </LegalSection>
        ))}
        <p className="text-right text-sm text-muted-foreground">{t("established")}</p>
      </div>
    </PageShell>
  );
}
