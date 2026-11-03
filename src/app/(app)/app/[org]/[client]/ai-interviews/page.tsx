import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AI_FEATURE, AGREEMENT_TARGET } from "@/features/ai-interview/domain";
import { agreementStats, listAiSessions } from "@/features/ai-interview/queries";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "AI面接" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

/** The client's AI interviews and how well people agree with the AI (docs/02 M12, P5 WP3). */
export default async function AiInterviewsPage({
  params,
}: PageProps<"/app/[org]/[client]/ai-interviews">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  if (!ctx.featureFlags.includes(AI_FEATURE) || ctx.role === "interviewer") notFound();
  const [t, rows, stats] = await Promise.all([
    getTranslations("AiReview"),
    listAiSessions(ctx),
    agreementStats(ctx),
  ]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}/ai-interviews`;
  const toReview = rows.filter((r) => r.toReview).length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {canEdit(ctx) ? (
          <Button asChild variant="outline">
            <Link href={`${base}/review`}>{t("blind.open")}</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.toReview")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{toReview}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.agreement")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{percent(stats.bandAgreement)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t("stats.agreementHint", {
              count: stats.count,
              target: Math.round(AGREEMENT_TARGET * 100),
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("stats.gap")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {stats.meanGap === null ? "—" : stats.meanGap.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{t("stats.gapHint")}</CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.job")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.band")}</TableHead>
                <TableHead>{t("columns.when")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`${base}/${row.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {row.candidateName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{row.jobTitle}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={row.toReview ? "default" : "outline"}>
                        {t(`status.${row.status}`)}
                      </Badge>
                      {row.flags.humanRequested ? (
                        <Badge variant="outline">{t("flags.humanRequested")}</Badge>
                      ) : null}
                      {row.flags.scoringFailed ? (
                        <Badge variant="destructive">{t("flags.scoringFailed")}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.band ? `${row.band}（${row.total?.toFixed(2)}）` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {row.completedAt
                      ? t("completedAt", { date: dateFormat.format(new Date(row.completedAt)) })
                      : t("deadlineAt", { date: dateFormat.format(new Date(row.deadlineAt)) })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
