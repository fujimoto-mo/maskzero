import { BriefcaseBusinessIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { greetingKey } from "@/lib/greeting";
import { requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function DashboardPage({
  params,
}: PageProps<"/app/[org]/[client]/dashboard">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const t = await getTranslations("App");

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{t(`dashboard.${greetingKey(new Date())}`)}</p>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BriefcaseBusinessIcon className="size-4 text-primary" aria-hidden />
            {t("dashboard.emptyTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.emptyBody")}</CardDescription>
        </CardHeader>
      </Card>

      <Card size="sm">
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t("dashboard.company")}</dt>
              <dd className="font-medium">{ctx.orgName}</dd>
            </div>
            {ctx.orgKind === "agency" ? (
              <div>
                <dt className="text-muted-foreground">{t("dashboard.client")}</dt>
                <dd className="font-medium">{ctx.clientName}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">{t("dashboard.role")}</dt>
              <dd className="font-medium">{t(`roles.${ctx.role}`)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
