import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { GROUP_STAGES, isStageGroup } from "@/features/candidates/stages";
import { isUuid } from "@/lib/utils";
import { recordAudit } from "@/server/audit";
import { canEdit, requireMember } from "@/server/auth/session";
import { decryptOptional } from "@/server/crypto/pii";
import { withRls } from "@/server/db/rls";
import { applications, candidates, jobs } from "@/server/db/schema";

const STAGE_LABELS: Record<string, string> = {
  applied: "応募",
  screening: "書類選考",
  booking: "面接調整",
  scheduled: "面接予定",
  interview: "面接",
  evaluation: "評価",
  offer: "内定",
  hired: "入社",
};
const OUTCOME_LABELS: Record<string, string> = {
  active: "選考中",
  rejected: "不合格",
  withdrawn: "辞退",
  hired: "採用",
};

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote everything; neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * The candidate list as CSV (docs/02 M5-4): UTF-8 with a BOM so Excel reads Japanese correctly.
 * Contact details leave the system here, so it needs editor rights and is audited.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/app/[org]/[client]/candidates/export">,
) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  if (!canEdit(ctx)) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const jobId = url.searchParams.get("job");
  const where: SQL[] = [eq(applications.orgId, ctx.orgId), eq(applications.clientId, ctx.clientId)];
  if (isStageGroup(group) && group !== "all") {
    where.push(
      group === "closed"
        ? inArray(applications.outcome, ["rejected", "withdrawn"])
        : inArray(applications.stage, GROUP_STAGES[group]),
    );
  }
  if (jobId && isUuid(jobId)) where.push(eq(applications.jobId, jobId));

  const rows = await withRls(ctx, async (tx) => {
    const rows = await tx
      .select({
        name: candidates.name,
        emailEnc: candidates.emailEnc,
        phoneEnc: candidates.phoneEnc,
        prefecture: candidates.prefecture,
        city: candidates.city,
        jobTitle: jobs.title,
        channel: applications.channel,
        appliedAt: applications.appliedAt,
        stage: applications.stage,
        outcome: applications.outcome,
        score: applications.score,
      })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(...where))
      .orderBy(desc(applications.appliedAt))
      .limit(10_000);
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "candidates.exported",
      targetType: "client",
      targetId: ctx.clientId,
      meta: { rows: rows.length, group: group ?? "all", jobId: jobId ?? null },
    });
    return rows;
  });

  const date = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  });
  const lines = [
    [
      "氏名",
      "メールアドレス",
      "電話番号",
      "都道府県",
      "市区町村",
      "求人",
      "応募経路",
      "応募日時",
      "選考段階",
      "状態",
      "スコア",
    ],
    ...rows.map((r) => [
      r.name,
      decryptOptional(r.emailEnc),
      decryptOptional(r.phoneEnc),
      r.prefecture,
      r.city,
      r.jobTitle,
      r.channel,
      date.format(r.appliedAt),
      STAGE_LABELS[r.stage],
      OUTCOME_LABELS[r.outcome],
      r.score,
    ]),
  ];
  const csv = `﻿${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="candidates-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
