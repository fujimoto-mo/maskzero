import { BriefcaseBusinessIcon, CircleAlertIcon, CircleCheckIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createJobAction } from "@/features/jobs/actions";
import { formatPay, isReadyToPost } from "@/features/jobs/checks";
import { JobStatusBadge } from "@/features/jobs/components/status-badge";
import { listJobs } from "@/features/jobs/queries";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "求人" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeZone: "Asia/Tokyo",
});

export default async function JobsPage({ params }: PageProps<"/app/[org]/[client]/jobs">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const [t, jobs] = await Promise.all([getTranslations("Jobs"), listJobs(ctx)]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}/jobs`;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {canEdit(ctx) ? (
          <form action={createJobAction.bind(null, ctx.orgSlug, ctx.clientSlug)}>
            <SubmitButton>
              <PlusIcon aria-hidden />
              {t("new")}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusinessIcon className="size-4 text-primary" aria-hidden />
              {t("empty.title")}
            </CardTitle>
            <CardDescription>{t("empty.body")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("columns.title")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.pay")}</TableHead>
                <TableHead>{t("columns.checks")}</TableHead>
                <TableHead className="text-right">{t("columns.applications")}</TableHead>
                <TableHead className="pr-4">{t("columns.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const errors = job.issues.filter((i) => i.level === "error").length;
                return (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-80 pl-4">
                      <Link
                        href={`${base}/${job.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {job.title || t("untitled")}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[job.fields.employmentType, job.fields.address].filter(Boolean).join("・")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-sm">{formatPay(job.fields) || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {isReadyToPost(job.issues) ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CircleCheckIcon className="size-4" aria-hidden />
                          {t("ready")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <CircleAlertIcon className="size-4" aria-hidden />
                          {t("errorCount", { count: errors })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {job.applicationCount}
                    </TableCell>
                    <TableCell className="pr-4 text-sm text-muted-foreground">
                      {dateFormat.format(job.updatedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
