import "server-only";
import { and, asc, desc, eq, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { normalizeEmail } from "@/lib/contact";
import type { MemberCtx } from "@/server/auth/session";
import { decryptOptional, hashPii } from "@/server/crypto/pii";
import { withRls } from "@/server/db/rls";
import { applications, candidates, documents, events, jobs, profiles } from "@/server/db/schema";
import type { Verdict } from "@/features/screening/domain";
import { GROUP_STAGES, type Outcome, type Stage, type StageGroup } from "./stages";

const PAGE_SIZE = 50;

export type CandidateRow = {
  applicationId: string;
  name: string;
  channel: string | null;
  source: string;
  appliedAt: string;
  jobTitle: string;
  stage: Stage;
  outcome: Outcome;
  verdict: Verdict;
  score: number | null;
};

export type CandidateFilters = { group: StageGroup; jobId?: string; q?: string; cursor?: string };

/** The cursor is "appliedAt|id" of the last row shown (keyset pagination, newest first). */
function parseCursor(cursor: string | undefined): { at: Date; id: string } | null {
  const [at, id] = cursor?.split("|") ?? [];
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) && id ? { at: date, id } : null;
}

function filterWhere(ctx: MemberCtx, f: CandidateFilters): SQL[] {
  const where: SQL[] = [eq(applications.orgId, ctx.orgId), eq(applications.clientId, ctx.clientId)];
  if (f.group === "closed") where.push(inArray(applications.outcome, ["rejected", "withdrawn"]));
  else if (f.group !== "all") {
    where.push(inArray(applications.stage, GROUP_STAGES[f.group]));
    if (f.group !== "passed") where.push(eq(applications.outcome, "active"));
  }
  if (f.jobId) where.push(eq(applications.jobId, f.jobId));
  const q = f.q?.trim();
  if (q) {
    // Emails are stored encrypted: an address is matched exactly through its lookup hash.
    where.push(
      q.includes("@")
        ? eq(candidates.emailHash, hashPii("email", normalizeEmail(q)))
        : ilike(candidates.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
    );
  }
  return where;
}

export async function listCandidates(
  ctx: MemberCtx,
  filters: CandidateFilters,
): Promise<{ rows: CandidateRow[]; nextCursor: string | null }> {
  const where = filterWhere(ctx, filters);
  const cursor = parseCursor(filters.cursor);
  if (cursor) {
    where.push(
      or(
        lt(applications.appliedAt, cursor.at),
        and(eq(applications.appliedAt, cursor.at), lt(applications.id, cursor.id)),
      )!,
    );
  }
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        applicationId: applications.id,
        name: candidates.name,
        channel: applications.channel,
        source: applications.source,
        appliedAt: applications.appliedAt,
        jobTitle: jobs.title,
        stage: applications.stage,
        outcome: applications.outcome,
        verdict: applications.verdict,
        score: applications.score,
      })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(...where))
      .orderBy(desc(applications.appliedAt), desc(applications.id))
      .limit(PAGE_SIZE + 1),
  );
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    rows: page.map((r) => ({ ...r, appliedAt: r.appliedAt.toISOString() })),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? `${last.appliedAt.toISOString()}|${last.applicationId}`
        : null,
  };
}

export type TimelineItem = {
  type: string;
  actor: "candidate" | "system" | "staff";
  actorName: string | null;
  payload: Record<string, unknown>;
  at: string;
};

export type CandidateDetail = {
  applicationId: string;
  candidateId: string;
  name: string;
  email: string | null;
  phone: string | null;
  prefecture: string | null;
  city: string | null;
  jobId: string;
  jobTitle: string;
  channel: string | null;
  source: string;
  appliedAt: string;
  stage: Stage;
  outcome: Outcome;
  currentRound: number;
  verdict: Verdict;
  score: number | null;
  waitingOn: "candidate" | "staff" | "system" | null;
  nextAction: string | null;
  closeReason: string | null;
  documents: { id: string; kind: string; fileName: string; ready: boolean }[];
  timeline: TimelineItem[];
};

/** The candidate drawer (docs/02 M5-2): status, contact details, documents and the timeline. */
export async function getCandidateDetail(
  ctx: MemberCtx,
  applicationId: string,
): Promise<CandidateDetail> {
  const detail = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        name: candidates.name,
        emailEnc: candidates.emailEnc,
        phoneEnc: candidates.phoneEnc,
        prefecture: candidates.prefecture,
        city: candidates.city,
        jobId: jobs.id,
        jobTitle: jobs.title,
        channel: applications.channel,
        source: applications.source,
        appliedAt: applications.appliedAt,
        stage: applications.stage,
        outcome: applications.outcome,
        currentRound: applications.currentRound,
        verdict: applications.verdict,
        score: applications.score,
        waitingOn: applications.waitingOn,
        nextAction: applications.nextAction,
        closeReason: applications.closeReason,
      })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
        ),
      );
    if (!app) return null;
    const [docs, timeline] = await Promise.all([
      tx
        .select({
          id: documents.id,
          kind: documents.kind,
          fileName: documents.fileName,
          status: documents.status,
        })
        .from(documents)
        .where(eq(documents.applicationId, applicationId))
        .orderBy(asc(documents.createdAt)),
      tx
        .select({
          type: events.type,
          actor: events.actor,
          actorName: profiles.name,
          actorEmail: profiles.email,
          payload: events.payload,
          at: events.occurredAt,
        })
        .from(events)
        .leftJoin(profiles, eq(profiles.id, events.actorId))
        .where(eq(events.applicationId, applicationId))
        .orderBy(desc(events.occurredAt))
        .limit(100),
    ]);
    return { app, docs, timeline };
  });
  if (!detail) notFound();
  const { app, docs, timeline } = detail;
  const { emailEnc, phoneEnc, ...rest } = app;
  return {
    ...rest,
    email: decryptOptional(emailEnc),
    phone: decryptOptional(phoneEnc),
    appliedAt: app.appliedAt.toISOString(),
    documents: docs
      .filter((d) => d.status !== "rejected")
      .map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName, ready: d.status === "ready" })),
    timeline: timeline.map((e) => ({
      type: e.type,
      actor: e.actor,
      actorName: e.actorName ?? e.actorEmail ?? null,
      payload: (e.payload ?? {}) as Record<string, unknown>,
      at: e.at.toISOString(),
    })),
  };
}
