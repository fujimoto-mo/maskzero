import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPortal } from "@/features/intake/entry-server";
import { ConsentToggle } from "@/features/pool/components/consent-toggle";
import { loadConsents } from "@/features/pool/consent-server";

export const instant = false; // per-request: the token is the only key to this page

export const metadata: Metadata = { title: "同意内容の確認", referrer: "no-referrer" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeZone: "Asia/Tokyo" });

/** What the candidate agreed to, and a way to stop job suggestions (docs/02 M3-8, M5-6). */
export default async function ConsentPage({ params }: PageProps<"/p/[token]/consent">) {
  const { token } = await params;
  await connection();
  const portal = await loadPortal(token);
  if (!portal) notFound();
  const [t, view] = await Promise.all([getTranslations("Consent"), loadConsents(portal.scope)]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("lead", { company: portal.view.company })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <h2 className="font-medium">{t("privacyTitle")}</h2>
          <p>
            {view.privacyAt
              ? t("privacyAt", { date: dateFormat.format(new Date(view.privacyAt)) })
              : t("privacyNone")}
          </p>
          <p className="text-muted-foreground">{t("requests")}</p>
        </CardContent>
      </Card>
      {view.otherJobs !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("otherJobsTitle")}</CardTitle>
            <CardDescription>{t("otherJobsLead")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConsentToggle token={token} initial={view.otherJobs} />
          </CardContent>
        </Card>
      ) : null}
      <Button asChild variant="outline" className="justify-self-start">
        <Link href={`/p/${token}`}>{t("back")}</Link>
      </Button>
    </div>
  );
}
