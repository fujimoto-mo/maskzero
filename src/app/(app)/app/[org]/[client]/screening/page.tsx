import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScreeningDrawer } from "@/features/screening/components/screening-drawer";
import { ScreeningView } from "@/features/screening/components/screening-view";
import { getScreeningDetail, listScreening, listScreeningJobs } from "@/features/screening/queries";
import { isScreeningFilter } from "@/features/screening/screening-filters";
import { isUuid } from "@/lib/utils";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "書類選考" };

export default async function ScreeningPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/screening">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const [t, jobs] = await Promise.all([getTranslations("Screening"), listScreeningJobs(ctx)]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

  const jobId = jobs.find((j) => j.id === query.job)?.id ?? jobs[0]?.id;
  const filter = isScreeningFilter(query.filter) ? query.filter : "all";
  const openId = typeof query.app === "string" && isUuid(query.app) ? query.app : null;
  const [list, detail] = await Promise.all([
    jobId ? listScreening(ctx, jobId, filter) : null,
    openId ? getScreeningDetail(ctx, openId) : null,
  ]);

  const closeParams = new URLSearchParams();
  if (jobId) closeParams.set("job", jobId);
  if (filter !== "all") closeParams.set("filter", filter);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {jobId && list ? (
        <ScreeningView
          base={base}
          jobs={jobs.map((j) => ({ id: j.id, title: j.title }))}
          jobId={jobId}
          filter={filter}
          rows={list.rows.map((r) => ({ ...r, appliedAt: r.appliedAt.toISOString() }))}
          counts={list.counts}
          canEdit={canEdit(ctx)}
          openId={openId}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("noJobs")}</CardDescription>
          </CardHeader>
        </Card>
      )}
      {detail ? (
        <ScreeningDrawer
          target={{ orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug }}
          detail={detail}
          closeHref={`${base}/screening?${closeParams}`}
          canEdit={canEdit(ctx)}
        />
      ) : null}
    </div>
  );
}
