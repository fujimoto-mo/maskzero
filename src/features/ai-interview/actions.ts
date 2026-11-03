"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { afterSchedulingChange, issueInvitation } from "@/features/interviews/server";
import { type MemberCtx, requireEditor } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import {
  aiInterviewConfigs,
  aiInterviewReviews,
  aiInterviewSessions,
  applications,
  jobs,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { aiInterviewCompleted } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { AI_FEATURE, type AiConfigInput, type Band, bandFor, configSchema } from "./domain";
import { inviteToAiInterview } from "./server";

// Staff actions for the AI interviewer (docs/02 M12). People decide every outcome; these only
// configure, re-invite, switch to a person, retry scoring and record blind ratings.

type Result = { ok: true } | { ok: false; error: "invalid" | "notFound" | "notAllowed" };

async function editorWithFeature(orgSlug: string, clientSlug: string): Promise<MemberCtx> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  if (!ctx.featureFlags.includes(AI_FEATURE)) throw new Error("The AI interviewer is off.");
  return ctx;
}

const base = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

/** Saves a job's AI interview: questions, follow-ups, rubric, time limit and deadline (M12-1). */
export async function saveAiConfigAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  input: AiConfigInput,
): Promise<Result> {
  const ctx = await editorWithFeature(orgSlug, clientSlug);
  const id = z.uuid().safeParse(jobId);
  const parsed = configSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: "invalid" };
  const config = parsed.data;
  if (config.enabled && config.questions.length === 0) return { ok: false, error: "invalid" };
  // Questions keep their ids across edits; new ones get one here.
  const questions = config.questions.map((q) => ({ ...q, id: q.id || randomUUID() }));
  const saved = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, id.data), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!job) return false;
    const values = {
      enabled: config.enabled,
      questions,
      timeLimitMinutes: config.timeLimitMinutes,
      deadlineDays: config.deadlineDays,
      updatedBy: ctx.userId,
    };
    await tx
      .insert(aiInterviewConfigs)
      .values({ jobId: job.id, orgId: ctx.orgId, clientId: ctx.clientId, ...values })
      .onConflictDoUpdate({ target: aiInterviewConfigs.jobId, set: values });
    return true;
  });
  if (!saved) return { ok: false, error: "notFound" };
  revalidatePath(`${base(ctx)}/jobs/${id.data}/ai-interview`);
  return { ok: true };
}

/** The session, if it belongs to the member's client. */
async function loadSession(ctx: MemberCtx, sessionId: string) {
  const id = z.uuid().safeParse(sessionId);
  if (!id.success) return null;
  const [row] = await withRls(ctx, (tx) =>
    tx
      .select({
        id: aiInterviewSessions.id,
        applicationId: aiInterviewSessions.applicationId,
        status: aiInterviewSessions.status,
        attempt: aiInterviewSessions.attempt,
        flags: aiInterviewSessions.flags,
        outcome: applications.outcome,
        round: applications.currentRound,
      })
      .from(aiInterviewSessions)
      .innerJoin(applications, eq(applications.id, aiInterviewSessions.applicationId))
      .where(
        and(
          eq(aiInterviewSessions.id, id.data),
          eq(aiInterviewSessions.orgId, ctx.orgId),
          eq(aiInterviewSessions.clientId, ctx.clientId),
        ),
      ),
  );
  return row ?? null;
}

/** One more try after the deadline passed unanswered (M12-5): a new session with a new deadline. */
export async function reinviteAiAction(
  orgSlug: string,
  clientSlug: string,
  sessionId: string,
): Promise<Result> {
  const ctx = await editorWithFeature(orgSlug, clientSlug);
  const session = await loadSession(ctx, sessionId);
  if (!session) return { ok: false, error: "notFound" };
  if (session.status !== "expired" || session.attempt > 1 || session.outcome !== "active") {
    return { ok: false, error: "notAllowed" };
  }
  const aiSessionId = await withRls(ctx, (tx) =>
    inviteToAiInterview(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: session.applicationId,
      attempt: session.attempt + 1,
      actor: "staff",
      actorId: ctx.userId,
    }),
  );
  if (!aiSessionId) return { ok: false, error: "notAllowed" };
  await afterSchedulingChange({ orgId: ctx.orgId, aiSessionId });
  revalidatePath(base(ctx), "layout");
  return { ok: true };
}

/** Invites to book round 1 with a person instead, when the AI interview expired or wasn't scored. */
export async function inviteHumanAction(
  orgSlug: string,
  clientSlug: string,
  sessionId: string,
): Promise<Result> {
  const ctx = await editorWithFeature(orgSlug, clientSlug);
  const session = await loadSession(ctx, sessionId);
  if (!session) return { ok: false, error: "notFound" };
  const unscored =
    session.status === "expired" ||
    (session.status === "completed" && Boolean(session.flags.scoringFailed));
  if (session.outcome !== "active" || !unscored) return { ok: false, error: "notAllowed" };
  const invitationId = await withRls(ctx, (tx) =>
    issueInvitation(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: session.applicationId,
      round: session.round,
      actor: "staff",
      actorId: ctx.userId,
    }),
  );
  if (!invitationId) return { ok: false, error: "notAllowed" };
  await afterSchedulingChange({ orgId: ctx.orgId, invitationId });
  revalidatePath(base(ctx), "layout");
  return { ok: true };
}

/** Scoring failed: try again. */
export async function rescoreAiAction(
  orgSlug: string,
  clientSlug: string,
  sessionId: string,
): Promise<Result> {
  const ctx = await editorWithFeature(orgSlug, clientSlug);
  const session = await loadSession(ctx, sessionId);
  if (!session) return { ok: false, error: "notFound" };
  if (session.status !== "completed" || !session.flags.scoringFailed) {
    return { ok: false, error: "notAllowed" };
  }
  await sendEventBestEffort(
    aiInterviewCompleted.create({ sessionId: session.id, orgId: ctx.orgId }),
  );
  return { ok: true };
}

const reviewSchema = z.object({
  sessionId: z.uuid(),
  scores: z.record(z.string().max(64), z.number().int().min(1).max(5)),
});

export type BlindComparison = {
  ai: { band: string; total: number; scores: Record<string, number> };
  mine: { band: Band; average: number };
};

/**
 * Records a blind rating (WP3) and returns the AI's scores for comparison, which the page shows
 * only after the rating is saved.
 */
export async function saveBlindReviewAction(
  orgSlug: string,
  clientSlug: string,
  input: { sessionId: string; scores: Record<string, number> },
): Promise<
  { ok: true; comparison: BlindComparison } | { ok: false; error: "invalid" | "notFound" }
> {
  const ctx = await editorWithFeature(orgSlug, clientSlug);
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withRls(ctx, async (tx) => {
    const [session] = await tx
      .select({
        applicationId: aiInterviewSessions.applicationId,
        questions: aiInterviewSessions.questions,
        scores: aiInterviewSessions.scores,
        total: aiInterviewSessions.total,
        band: aiInterviewSessions.band,
      })
      .from(aiInterviewSessions)
      .where(
        and(
          eq(aiInterviewSessions.id, parsed.data.sessionId),
          eq(aiInterviewSessions.orgId, ctx.orgId),
          eq(aiInterviewSessions.clientId, ctx.clientId),
          eq(aiInterviewSessions.status, "scored"),
        ),
      );
    if (!session || session.total === null || !session.band) return null;
    // Every question rated, nothing else.
    const ids = session.questions.map((q) => q.id);
    const given = Object.keys(parsed.data.scores);
    if (given.length !== ids.length || !ids.every((qid) => qid in parsed.data.scores)) {
      return "invalid" as const;
    }
    const average = ids.reduce((sum, qid) => sum + parsed.data.scores[qid]!, 0) / ids.length;
    const band = bandFor(average);
    await tx
      .insert(aiInterviewReviews)
      .values({
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        sessionId: parsed.data.sessionId,
        reviewerId: ctx.userId,
        scores: parsed.data.scores,
        band,
      })
      .onConflictDoUpdate({
        target: [aiInterviewReviews.sessionId, aiInterviewReviews.reviewerId],
        set: { scores: parsed.data.scores, band },
      });
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: session.applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "ai_interview.reviewed",
      payload: { sessionId: parsed.data.sessionId, band, agrees: band === session.band },
    });
    return {
      ai: {
        band: session.band,
        total: Number(session.total),
        scores: Object.fromEntries(session.scores.map((s) => [s.questionId, s.score])),
      },
      mine: { band, average: Math.round(average * 100) / 100 },
    };
  });
  if (result === null) return { ok: false, error: "notFound" };
  if (result === "invalid") return { ok: false, error: "invalid" };
  // No revalidation here: it would replace the page with the next interview before the
  // reviewer sees the comparison. "Next" refreshes the page.
  return { ok: true, comparison: result };
}
