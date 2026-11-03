import { LayoutDashboardIcon, SmartphoneIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageShell } from "../_components/page-shell";
import { DemoStart } from "./demo-start";

// /demo (docs/02 M0-4): explains the sandbox and starts one. The page itself is static; the
// buttons create the visitor's own sandbox through POST /api/demo.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Demo.meta");
  return { title: t("title"), description: t("description"), alternates: { canonical: "/demo" } };
}

const VIEWS = [
  { key: "admin", icon: <LayoutDashboardIcon /> },
  { key: "candidate", icon: <SmartphoneIcon /> },
] as const;

export default async function DemoPage() {
  const t = await getTranslations("Demo");
  return (
    <PageShell title={t("title")} intro={<p>{t("intro")}</p>}>
      <div className="space-y-8">
        <ul className="grid gap-3 sm:grid-cols-2">
          {VIEWS.map((view) => (
            <li key={view.key} className="flex gap-4 rounded-2xl border bg-card p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary [&_svg]:size-5">
                {view.icon}
              </span>
              <div>
                <h2 className="font-bold">{t(`views.${view.key}.title`)}</h2>
                <p className="mt-1.5 text-[15px] leading-7 text-muted-foreground">
                  {t(`views.${view.key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <section aria-labelledby="demo-notes" className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 id="demo-notes" className="text-lg font-bold">
            {t("notes.title")}
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-muted-foreground">
            {(["expires", "noEmail", "noRealData", "aiLimit"] as const).map((key) => (
              <li key={key}>{t(`notes.${key}`)}</li>
            ))}
          </ul>
        </section>

        <DemoStart />
      </div>
    </PageShell>
  );
}
