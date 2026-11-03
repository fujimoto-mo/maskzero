import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Usage } from "../limits";
import type { Limit, Plan } from "../plans";

const usd = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "USD" });

/** The plan's limits against this month's use (docs/02 M13-4, M13-5). */
export async function PlanUsage({
  plan,
  usage,
  agency,
}: {
  plan: Plan;
  usage: Usage;
  agency: boolean;
}) {
  const t = await getTranslations("Settings.plan");
  const rows: { key: Limit; used: number; label: string; format: (n: number) => string }[] = [
    ...(agency
      ? [{ key: "clients" as const, used: usage.clients, label: t("clients"), format: String }]
      : []),
    {
      key: "publishedJobs",
      used: usage.publishedJobs,
      label: t("publishedJobs"),
      format: String,
    },
    {
      key: "aiUsdPerMonth",
      used: usage.aiUsdThisMonth,
      label: t("aiUsd"),
      format: (n) => usd.format(n),
    },
  ];
  const aiLimit = plan.limits.aiUsdPerMonth;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("current", { plan: t(`plans.${plan.id as "trial"}`) })} {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid gap-4">
          {rows.map((row) => {
            const limit = plan.limits[row.key];
            const share = limit ? Math.min(1, row.used / limit) : 0;
            return (
              <div key={row.key} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt>{row.label}</dt>
                  <dd className="tabular-nums">
                    {limit === null
                      ? `${row.format(row.used)}（${t("unlimited")}）`
                      : t("ofLimit", { used: row.format(row.used), limit: row.format(limit) })}
                  </dd>
                </div>
                {limit !== null ? (
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={row.label}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={row.used}
                  >
                    <div
                      className={share >= 1 ? "h-full bg-destructive" : "h-full bg-primary"}
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </dl>
        {aiLimit !== null && usage.aiUsdThisMonth >= aiLimit ? (
          <p className="text-sm text-destructive">{t("quotaReached")}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t("change")}{" "}
          <Link href="/#contact" className="text-primary underline-offset-4 hover:underline">
            {t("contact")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
