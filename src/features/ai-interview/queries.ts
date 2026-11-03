import "server-only";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { decryptPii } from "@/server/crypto/pii";
import { withRls } from "@/server/db/rls";
import {
  type AiQuestion,
  type AiQuestionScore,
  type AiSessionFlags,
  aiInterviewConfigs,
  aiInterviewReviews,
  aiInterviewSessions,
  applications,
  candidates,
  interviewInvitations,
  jobs,
} from "@/server/db/schema";
import { type AiConfigInput, agreement, type AiSessionStatus, type Turn } from "./domain";

// Staff views of the AI interviewer (docs/02 M12). Everything runs under RLS for the member's
// client; interviewers see none of it.

const turnsOf = (enc: string | null): Turn[] =>
  enc ? (JSON.parse(decryptPii(enc)) as Turn[]) : [];

export async function getAiConfig(
  ctx: MemberCtx,
  jobId: string,
): Promise<{ jobTitle: string; config: AiConfigInput | null } | null> {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({
        jobTitle: jobs.title,
        enabled: aiInterviewConfigs.enabled,
        questions: aiInterviewConfigs.questions,
        timeLimitMinutes: aiInterviewConfigs.timeLimitMinutes,
        deadlineDays: aiInterviewConfigs.deadlineDays,
      })
      .from(jobs)
      .leftJoin(aiInterviewConfigs, eq(aiInterviewConfigs.jobId, jobs.id))
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!row) return null;
    return {
      jobTitle: row.jobTitle,
      config:
        row.enabled === null
          ? null
          : {
              enabled: row.enabled,
              questions: row.questions ?? [],
              timeLimitMinutes: row.timeLimitMinutes ?? 30,
              deadlineDays: row.deadlineDays ?? 7,
            },
    };
  });
}

export type AiSessionRow = {
  id: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: AiSessionStatus;
  band: string | null;
  total: number | null;
  deadlineAt: string;
  completedAt: string | null;
  flags: AiSessionFlags;
  /** Whether the application still waits for a person to review it. */
  toReview: boolean;
};

/** The client's latest AI interviews, newest first. */
export async function listAiSessions(ctx: MemberCtx): Promise<AiSessionRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        id: aiInterviewSessions.id,
        applicationId: aiInterviewSessions.applicationId,
        candidateName: candidates.name,
        jobTitle: jobs.title,
        status: aiInterviewSessions.status,
        band: aiInterviewSessions.band,
        total: aiInterviewSessions.total,
        deadlineAt: aiInterviewSessions.deadlineAt,
        completedAt: aiInterviewSessions.completedAt,
        flags: aiInterviewSessions.flags,
        nextAction: applications.nextAction,
        outcome: applications.outcome,
      })
      .from(aiInterviewSessions)
      .innerJoin(applications, eq(applications.id, aiInterviewSessions.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(aiInterviewSessions.orgId, ctx.orgId),
          eq(aiInterviewSessions.clientId, ctx.clientId),
        ),
      )
      .orderBy(desc(aiInterviewSessions.createdAt))
      .limit(200),
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    candidateName: r.candidateName,
    jobTitle: r.jobTitle,
    status: r.status,
    band: r.band,
    total: r.total === null ? null : Number(r.total),
    deadlineAt: r.deadlineAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    flags: r.flags,
    toReview:
      r.outcome === "active" &&
      (r.nextAction === "review_ai_interview" || r.nextAction === "ai_interview_expired"),
  }));
}

export type AiSessionDetail = {
  id: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: AiSessionStatus;
  attempt: number;
  deadlineAt: string;
  startedAt: string | null;
  completedAt: string | null;
  timeLimitMinutes: number;
  questions: AiQuestion[];
  turns: Turn[];
  scores: AiQuestionScore[] | null;
  total: number | null;
  band: string | null;
  summary: string | null;
  flags: AiSessionFlags;
  model: string | null;
  outcome: (typeof applications.$inferSelect)["outcome"];
  /** An invitation to book round 1 with a person already exists. */
  humanInvited: boolean;
  reviewCount: number;
};

export async function getAiSessionDetail(
  ctx: MemberCtx,
  sessionId: string,
): Promise<AiSessionDetail | null> {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({
        session: aiInterviewSessions,
        candidateName: candidates.name,
        jobTitle: jobs.title,
        outcome: applications.outcome,
        round: applications.currentRound,
      })
      .from(aiInterviewSessions)
      .innerJoin(applications, eq(applications.id, aiInterviewSessions.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(aiInterviewSessions.id, sessionId),
          eq(aiInterviewSessions.orgId, ctx.orgId),
          eq(aiInterviewSessions.clientId, ctx.clientId),
        ),
      );
    if (!row) return null;
    const s = row.session;
    const [[invitation], [reviews]] = await Promise.all([
      tx
        .select({ id: interviewInvitations.id })
        .from(interviewInvitations)
        .where(
          and(
            eq(interviewInvitations.applicationId, s.applicationId),
            eq(interviewInvitations.round, 1),
          ),
        ),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(aiInterviewReviews)
        .where(eq(aiInterviewReviews.sessionId, s.id)),
    ]);
    return {
      id: s.id,
      applicationId: s.applicationId,
      candidateName: row.candidateName,
      jobTitle: row.jobTitle,
      status: s.status,
      attempt: s.attempt,
      deadlineAt: s.deadlineAt.toISOString(),
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      timeLimitMinutes: s.timeLimitMinutes,
      questions: s.questions,
      turns: turnsOf(s.transcriptEnc),
      scores: s.scores,
      total: s.total === null ? null : Number(s.total),
      band: s.band,
      summary: s.summary,
      flags: s.flags,
      model: s.model,
      outcome: row.outcome,
      humanInvited: Boolean(invitation),
      reviewCount: reviews?.count ?? 0,
    };
  });
}

export type BlindItem = {
  sessionId: string;
  jobTitle: string;
  questions: AiQuestion[];
  turns: Turn[];
};

/**
 * The next scored interview this member hasn't rated, without the candidate's name or the AI's
 * scores (WP3: blind review against the AI).
 */
export async function nextBlindItem(ctx: MemberCtx): Promise<BlindItem | null> {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({
        sessionId: aiInterviewSessions.id,
        jobTitle: jobs.title,
        questions: aiInterviewSessions.questions,
        transcriptEnc: aiInterviewSessions.transcriptEnc,
      })
      .from(aiInterviewSessions)
      .innerJoin(applications, eq(applications.id, aiInterviewSessions.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(aiInterviewSessions.orgId, ctx.orgId),
          eq(aiInterviewSessions.clientId, ctx.clientId),
          eq(aiInterviewSessions.status, "scored"),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(aiInterviewReviews)
              .where(
                and(
                  eq(aiInterviewReviews.sessionId, aiInterviewSessions.id),
                  eq(aiInterviewReviews.reviewerId, ctx.userId),
                ),
              ),
          ),
        ),
      )
      // A random pick, so the sample isn't just the latest interviews.
      .orderBy(sql`random()`)
      .limit(1);
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      jobTitle: row.jobTitle,
      questions: row.questions,
      turns: turnsOf(row.transcriptEnc),
    };
  });
}

/** Agreement between people's blind ratings and the AI across the client (P5 exit criterion). */
export async function agreementStats(ctx: MemberCtx) {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        aiBand: aiInterviewSessions.band,
        aiTotal: aiInterviewSessions.total,
        humanBand: aiInterviewReviews.band,
        humanScores: aiInterviewReviews.scores,
      })
      .from(aiInterviewReviews)
      .innerJoin(aiInterviewSessions, eq(aiInterviewSessions.id, aiInterviewReviews.sessionId))
      .where(
        and(
          eq(aiInterviewReviews.orgId, ctx.orgId),
          eq(aiInterviewReviews.clientId, ctx.clientId),
          eq(aiInterviewSessions.status, "scored"),
        ),
      ),
  );
  return agreement(
    rows
      .filter((r) => r.aiBand !== null && r.aiTotal !== null)
      .map((r) => {
        const values = Object.values(r.humanScores);
        return {
          aiBand: r.aiBand!,
          aiTotal: Number(r.aiTotal),
          humanBand: r.humanBand,
          humanAverage: values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1),
        };
      }),
  );
}
