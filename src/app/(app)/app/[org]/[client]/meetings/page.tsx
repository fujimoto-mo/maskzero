import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listInterviewsOn } from "@/features/interviews/workspace";
import { addDays, jstDateKey, jstTime, weekdayOf } from "@/features/scheduling/slots";
import { TOOL_LABELS } from "@/server/messaging/send";
import { requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "面接" };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** One day's interviews (docs/02 M11-1); interviewers see the ones they run. */
export default async function InterviewDayPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/meetings">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const today = jstDateKey(new Date());
  const date = typeof query.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.d) ? query.d : today;
  const [t, rows] = await Promise.all([getTranslations("Day"), listInterviewsOn(ctx, date)]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}/meetings`;
  const label = `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日（${WEEKDAYS[weekdayOf(date)]}）`;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("prev")}>
          <Link href={`${base}?d=${addDays(date, -1)}`}>
            <ChevronLeftIcon aria-hidden />
          </Link>
        </Button>
        <p className="min-w-36 text-center font-medium">{label}</p>
        <Button asChild variant="ghost" size="icon" aria-label={t("next")}>
          <Link href={`${base}?d=${addDays(date, 1)}`}>
            <ChevronRightIcon aria-hidden />
          </Link>
        </Button>
        {date !== today ? (
          <Button asChild variant="outline" size="sm">
            <Link href={base}>{t("today")}</Link>
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t("empty")}</Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium tabular-nums">
                  {jstTime(new Date(row.startsAt))}〜{jstTime(new Date(row.endsAt))}
                </span>
                <Link
                  href={`${base}/${row.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {row.candidateName}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {row.jobTitle}・{t("round", { round: row.round })}
                </span>
                {row.status !== "scheduled" ? (
                  <Badge variant="outline">{t(`status.${row.status}`)}</Badge>
                ) : null}
                {row.mine ? <Badge>{t("yours")}</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{TOOL_LABELS[row.tool] ?? row.tool}</span>
                {row.meetingUrl && row.status === "scheduled" ? (
                  <a
                    href={row.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {t("join")}
                  </a>
                ) : row.location ? (
                  <span>{row.location}</span>
                ) : null}
                <span>
                  {t("interviewers")}：
                  {row.interviewers.length ? row.interviewers.join("、") : t("unassigned")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
