import {
  ArrowRightIcon,
  DatabaseIcon,
  FileWarningIcon,
  KeyRoundIcon,
  LockIcon,
  ListChecksIcon,
  QuoteIcon,
  ScrollTextIcon,
  ServerIcon,
  UserCheckIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PageShell } from "../_components/page-shell";

// Only measures that exist in the product today. Keep this list in sync with the implementation.
const GROUPS = [
  {
    key: "data",
    items: [
      { key: "isolation", icon: <DatabaseIcon /> },
      { key: "storage", icon: <LockIcon /> },
      { key: "encryption", icon: <KeyRoundIcon /> },
      { key: "audit", icon: <ScrollTextIcon /> },
    ],
  },
  {
    key: "ai",
    items: [
      { key: "human", icon: <UserCheckIcon /> },
      { key: "evidence", icon: <QuoteIcon /> },
      { key: "fairness", icon: <ListChecksIcon /> },
    ],
  },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SecurityOverview.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/security" },
  };
}

export default async function SecurityPage() {
  const t = await getTranslations("SecurityOverview");
  const tOperator = await getTranslations("Site.operator");

  return (
    <PageShell title={t("title")} intro={<p>{t("intro")}</p>}>
      <div className="space-y-10">
        {GROUPS.map((group) => (
          <section key={group.key} aria-labelledby={`security-${group.key}`}>
            <h2 id={`security-${group.key}`} className="text-lg font-bold sm:text-xl">
              {t(`groups.${group.key}`)}
            </h2>
            <ul className="mt-4 grid gap-3">
              {group.items.map((item) => (
                <li key={item.key} className="flex gap-4 rounded-2xl border bg-card p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary [&_svg]:size-5">
                    {item.icon}
                  </span>
                  <div>
                    <h3 className="font-bold">{t(`items.${item.key}.title`)}</h3>
                    <p className="mt-1.5 text-[15px] leading-7 text-muted-foreground">
                      {t(`items.${item.key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section
          aria-labelledby="security-providers"
          className="rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="security-providers" className="flex items-center gap-2 text-lg font-bold">
            <ServerIcon aria-hidden="true" className="size-5 text-primary" />
            {t("providers.title")}
          </h2>
          <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{t("providers.body")}</p>
          <Link
            href="/privacy#privacy-foreign"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("providers.link")}
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </section>

        <section
          aria-labelledby="security-report"
          className="rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="security-report" className="flex items-center gap-2 text-lg font-bold">
            <FileWarningIcon aria-hidden="true" className="size-5 text-primary" />
            {t("report.title")}
          </h2>
          <p className="mt-2 text-[15px] leading-7 text-muted-foreground">
            {t("report.body", { email: tOperator("email") })}
          </p>
        </section>
      </div>
    </PageShell>
  );
}
