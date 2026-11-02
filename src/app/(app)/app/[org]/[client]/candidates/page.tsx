import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CandidateDrawer } from "@/features/candidates/components/candidate-drawer";
import { CandidatesView, type ListState } from "@/features/candidates/components/candidates-view";
import { getCandidateDetail, listCandidates } from "@/features/candidates/queries";
import { isStageGroup } from "@/features/candidates/stages";
import { listJobOptions } from "@/features/jobs/queries";
import { isUuid } from "@/lib/utils";
import { canEdit, isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "応募者" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function CandidatesPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/candidates">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

  const group = isStageGroup(query.group) ? query.group : "all";
  const jobParam = one(query.job);
  const state: ListState = {
    group,
    jobId: jobParam && isUuid(jobParam) ? jobParam : null,
    q: one(query.q)?.slice(0, 100) ?? "",
    cursor: one(query.cursor) ?? null,
  };
  const app = one(query.app);
  const openId = app && isUuid(app) ? app : null;

  const [t, jobs, list, detail] = await Promise.all([
    getTranslations("Candidates"),
    listJobOptions(ctx),
    listCandidates(ctx, {
      group,
      jobId: state.jobId ?? undefined,
      q: state.q,
      cursor: state.cursor ?? undefined,
    }),
    openId ? getCandidateDetail(ctx, openId) : null,
  ]);

  const close = new URLSearchParams();
  if (group !== "all") close.set("group", group);
  if (state.jobId) close.set("job", state.jobId);
  if (state.q) close.set("q", state.q);
  if (state.cursor) close.set("cursor", state.cursor);
  const closeQuery = close.toString();

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <CandidatesView
        base={base}
        state={state}
        jobs={jobs.map((j) => ({ id: j.id, title: j.title }))}
        rows={list.rows}
        nextCursor={list.nextCursor}
        openId={openId}
        canEdit={canEdit(ctx)}
      />
      {detail ? (
        <CandidateDrawer
          base={base}
          detail={detail}
          closeHref={`${base}/candidates${closeQuery ? `?${closeQuery}` : ""}`}
          canEdit={canEdit(ctx)}
          canDelete={isAdmin(ctx)}
        />
      ) : null}
    </div>
  );
}
