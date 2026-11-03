import { BriefcaseBusinessIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList, Columns, Funnel } from "@/features/dashboard/components/charts";
import { getDashboard } from "@/features/dashboard/queries";
import { listJobOptions } from "@/features/jobs/queries";
import { jstTime } from "@/features/scheduling/slots";
import { greetingKey } from "@/lib/greeting";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "ダッシュボード" };

const SOURCES = ["entry", "csv", "manual", "test"] as const;

export default async function DashboardPage({
  params,
}: PageProps<"/app/[org]/[client]/dashboard">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const now = new Date();
  const [t, sources, jobs, data] = await Promise.all([
    getTranslations("App.dashboard"),
    getTranslations("Candidates.sources"),
    listJobOptions(ctx),
    getDashboard(ctx, now),
  ]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;
  const firstJob = jobs[0]?.id;
  const screening = (filter: string) =>
    firstJob ? `${base}/screening?job=${firstJob}&filter=${filter}` : `${base}/screening`;

  const counters = [
    { key: "toReview", value: data.counters.toReview, href: screening("check") },
    { key: "toConfirm", value: data.counters.toConfirm, href: screening("fail_pending") },
    {
      key: "toInvite",
      value: data.counters.toInvite,
      href: `${base}/candidates?group=interviewing`,
    },
    {
      key: "waitingDocuments",
      value: data.counters.waitingDocuments,
      href: `${base}/candidates?group=screening`,
    },
    {
      key: "pendingRequests",
      value: data.counters.pendingRequests,
      href: `${base}/interviews?tab=action`,
    },
  ] as const;
  const lastWeek = data.days.slice(0, 7).reduce((sum, d) => sum + d.count, 0);
  const thisWeek = data.days.slice(7).reduce((sum, d) => sum + d.count, 0);
  const monthLabel = (key: string) => `${Number(key.slice(5))}月`;
  // Applications without a job board are grouped by how they arrived (CSV, added by hand, …).
  const boardLabel = (channel: string) =>
    (SOURCES as readonly string[]).includes(channel)
      ? sources(channel as (typeof SOURCES)[number])
      : channel;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{t(greetingKey(now))}</p>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusinessIcon className="size-4 text-primary" aria-hidden />
              {t("emptyTitle")}
            </CardTitle>
            <CardDescription>{t("emptyBody")}</CardDescription>
          </CardHeader>
          {canEdit(ctx) ? (
            <CardContent>
              <Button asChild>
                <Link href={`${base}/jobs`}>{t("createJob")}</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <section aria-labelledby="todo" className="grid gap-3">
        <h2 id="todo" className="text-sm font-semibold">
          {t("todo")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {counters.map((c) => (
            <li key={c.key}>
              <Link
                href={c.href}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <span className="grid gap-1">
                  <span className="text-sm text-muted-foreground">{t(`counters.${c.key}`)}</span>
                  <span className="text-2xl font-bold tabular-nums">{c.value}</span>
                </span>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("todayTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.today.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("todayEmpty")}</p>
          ) : (
            <ul className="grid gap-2">
              {data.today.map((item) => (
                <li
                  key={`${item.applicationId}-${item.startsAt}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                >
                  <span className="font-medium tabular-nums">
                    {jstTime(new Date(item.startsAt))}〜{jstTime(new Date(item.endsAt))}
                  </span>
                  <Link
                    href={`${base}/meetings/${item.interviewId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {t("todayRound", { round: item.round })}
                  </span>
                  {item.meetingUrl ? (
                    <a
                      href={item.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {t("join")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            <BarList
              title={t("boards")}
              head={[t("columns.channel"), t("columns.count"), t("columns.lastMonth")]}
              empty={t("noApplications")}
              items={data.boards
                .filter((b) => b.thisMonth > 0 || b.lastMonth > 0)
                .map((b) => ({
                  label: boardLabel(b.channel),
                  value: b.thisMonth,
                  note: t("lastMonth", { count: b.lastMonth }),
                  tooltip: t("boardTooltip", {
                    channel: boardLabel(b.channel),
                    thisMonth: b.thisMonth,
                    lastMonth: b.lastMonth,
                  }),
                }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Columns
              title={t("days")}
              description={t("weekCompare", { thisWeek, lastWeek })}
              head={[t("columns.date"), t("columns.count")]}
              items={data.days.map((d) => ({
                label: d.date,
                short: String(Number(d.date.slice(8))),
                value: d.count,
                tooltip: t("dayTooltip", { date: d.date, count: d.count }),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Columns
              title={t("trend")}
              legend={[t("thisYear"), t("lastYearLegend")]}
              head={[t("columns.month"), t("columns.count"), t("columns.lastYear")]}
              items={data.months.map((m) => ({
                label: m.month,
                short: monthLabel(m.month),
                value: m.count,
                compare: m.lastYear,
                tooltip: t("monthTooltip", {
                  month: m.month,
                  count: m.count,
                  lastYear: m.lastYear,
                }),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Funnel
              title={t("funnel")}
              description={t("funnelHint")}
              head={[t("columns.step"), t("columns.count"), t("columns.rate")]}
              steps={data.funnel.map((s) => ({ label: t(`steps.${s.step}`), count: s.count }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
