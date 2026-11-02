import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "../_components/page-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CompanyInfo.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/company" },
  };
}

export default async function CompanyPage() {
  const t = await getTranslations("CompanyInfo");
  const tOperator = await getTranslations("Site.operator");

  const rows = [
    { key: "name", value: tOperator("name") },
    { key: "representative", value: tOperator("representative") },
    { key: "address", value: tOperator("address") },
    { key: "established", value: tOperator("established") },
    { key: "business", value: t("business") },
    { key: "contact", value: tOperator("email") },
  ] as const;

  return (
    <PageShell title={t("title")}>
      <dl className="divide-y rounded-2xl border bg-card">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid gap-1 px-5 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6 sm:px-6"
          >
            <dt className="text-sm font-semibold text-muted-foreground">
              {t(`labels.${row.key}`)}
            </dt>
            <dd className="text-[15px] leading-7">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm leading-7 text-muted-foreground">
        {t.rich("contactNote", {
          link: (chunks: ReactNode) => (
            <Link
              href="/#contact"
              className="font-medium text-primary underline underline-offset-4"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </PageShell>
  );
}
