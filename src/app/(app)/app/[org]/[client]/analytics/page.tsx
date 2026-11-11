import { LightbulbIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pillTab } from "@/components/pill-tab";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  averageDays,
  byBoard,
  funnel,
  openRateByHour,
  openToBookingHours,
  periodFor,
  responseLag,
  worstStep,
} from "@/features/analytics/domain";
import { COHORT_LIMIT, getAnalytics } from "@/features/analytics/queries";
import { Columns, Funnel } from "@/features/dashboard/components/charts";
import { requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "分析" };

const PERIOD_KEYS = ["m", "p", "q"] as const;
const SOURCES = ["entry", "csv", "manual", "test"] as const;

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
const oneDecimal = (n: number | null) => (n === null ? "—" : n.toFixed(1));

export default async function AnalyticsPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/analytics">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const period = periodFor(one(query.period), new Date(), {
    from: one(query.from),
    to: one(query.to),
  });
  const [t, sources, data] = await Promise.all([
    getTranslations("Analytics"),
    getTranslations("Candidates.sources"),
    getAnalytics(ctx, period),
  ]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}/analytics`;
  const steps = funnel(data.rows);
  const worst = worstStep(steps);
  const lag = responseLag(data.rows);
  const boards = byBoard(data.rows);
  const hours = openRateByHour(data.rows);
  const days = averageDays(data.rows);
  const openToBooking = openToBookingHours(data.rows);
  const boardLabel = (channel: string) =>
    (SOURCES as readonly string[]).includes(channel)
      ? sources(channel as (typeof SOURCES)[number])
      : channel;
  const lastDay = new Date(Date.parse(`${period.to}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label={t("period")} className="flex flex-wrap gap-2">
          {PERIOD_KEYS.map((key) => (
            <Link
              key={key}
              href={`${base}?period=${key}`}
              aria-current={period.key === key ? "page" : undefined}
              className={pillTab(period.key === key)}
            >
              {t(`periods.${key}`)}
            </Link>
          ))}
        </nav>
        <form action={base} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="c" />
          <div className="grid gap-1">
            <Label htmlFor="period-from" className="text-xs">
              {t("from")}
            </Label>
            <Input
              id="period-from"
              name="from"
              type="date"
              defaultValue={period.from}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="period-to" className="text-xs">
              {t("to")}
            </Label>
            <Input id="period-to" name="to" type="date" defaultValue={lastDay} className="w-40" />
          </div>
          <Button type="submit" variant="outline" size="sm">
            {t("apply")}
          </Button>
        </form>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("cohort", { from: period.from, to: lastDay, count: data.rows.length })}
        {data.truncated ? ` ${t("truncated", { limit: COHORT_LIMIT })}` : null}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            <Funnel
              title={t("funnel")}
              description={t("funnelHint")}
              head={[t("columns.step"), t("columns.count"), t("columns.rate")]}
              steps={steps.map((s) => ({ label: t(`steps.${s.step}`), count: s.count }))}
            />
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LightbulbIcon aria-hidden className="size-4 text-primary" />
                {t("worstTitle")}
              </CardTitle>
              {worst ? (
                <CardDescription>
                  {t("worstLead", {
                    step: t(`steps.${worst}`),
                    rate: percent(steps.find((s) => s.step === worst)!.rate),
                  })}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <p className="text-sm">{worst ? t(`fixes.${worst}`) : t("worstNone")}</p>
            </CardContent>
          </Card>
          {data.notified > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("notifiedTitle")}</CardTitle>
                <CardDescription>
                  {t("notifiedLead", {
                    notified: data.notified,
                    entered: data.notifiedEntered,
                    rate: percent(data.notifiedEntered / data.notified),
                  })}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("lagTitle")}</CardTitle>
          <CardDescription>
            {t("lagHint")}{" "}
            {openToBooking === null
              ? null
              : t("openToBooking", { hours: oneDecimal(openToBooking) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.openedWithin")}</TableHead>
                <TableHead className="text-right">{t("columns.people")}</TableHead>
                <TableHead className="text-right">{t("columns.interviewRate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lag.map((row) => (
                <TableRow key={row.bucket}>
                  <TableCell>{t(`lag.${row.bucket}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent(row.interviewRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("boardsTitle")}</CardTitle>
          <CardDescription>{t("boardsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.board")}</TableHead>
                  <TableHead className="text-right">{t("columns.volume")}</TableHead>
                  <TableHead className="text-right">{t("columns.passRate")}</TableHead>
                  <TableHead className="text-right">{t("columns.daysToRespond")}</TableHead>
                  <TableHead className="text-right">{t("columns.interviewRate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boards.map((b) => (
                  <TableRow key={b.channel}>
                    <TableCell>{boardLabel(b.channel)}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.volume}</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(b.passRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {oneDecimal(b.daysToRespond)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percent(b.interviewRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            {hours.length === 0 ? (
              <div className="grid gap-1">
                <p className="font-medium">{t("hoursTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              </div>
            ) : (
              <Columns
                title={t("hoursTitle")}
                description={t("hoursHint")}
                head={[t("columns.hour"), t("columns.openRate")]}
                items={hours.map((h) => ({
                  label: t("hour", { hour: h.hour }),
                  short: String(h.hour),
                  value: Math.round(h.rate * 100),
                  tooltip: t("hourTooltip", {
                    hour: h.hour,
                    rate: percent(h.rate),
                    sent: h.sent,
                    opened: h.opened,
                  }),
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("daysTitle")}</CardTitle>
            <CardDescription>{t("daysHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.stage")}</TableHead>
                  <TableHead className="text-right">{t("columns.days")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.to}>
                    <TableCell>
                      {t(`steps.${d.from}`)} → {t(`steps.${d.to}`)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{oneDecimal(d.days)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
