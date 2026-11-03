import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { issueInvitation } from "@/features/interviews/server";
import { looksLikeInjection } from "@/features/screening/text";
import { proposeFollowUp } from "@/server/ai/ai-interviewer";
import { decryptPii, encryptPii } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import type { Tx } from "@/server/db/client";
import { aiInterviewSessions, applications, consents } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import {
  type CandidateSessionView,
  exchangeFor,
  MAX_ANSWER_CHARS,
  nextStep,
  secondsLeft,
  type Turn,
} from "./domain";

// The candidate's side of the AI interview (docs/02 M12-2), on the admin connection, always
// scoped by the application the personal-page token resolved to.

export type CandidateScope = { applicationId: string; orgId: string; clientId: string };

/** Text version recorded with the candidate's consent to the AI interview. */
export const AI_CONSENT_VERSION = "ai-interview-v1";

type Session = typeof aiInterviewSessions.$inferSelect;

const turnsOf = (session: Pick<Session, "transcriptEnc">): Turn[] =>
  session.transcriptEnc ? (JSON.parse(decryptPii(session.transcriptEnc)) as Turn[]) : [];

async function sessionFor(
  conn: Tx | ReturnType<typeof getAdminDb>,
  scope: CandidateScope,
  lock = false,
) {
  const query = conn
    .select()
    .from(aiInterviewSessions)
    .where(
      and(
        eq(aiInterviewSessions.applicationId, scope.applicationId),
        eq(aiInterviewSessions.orgId, scope.orgId),
      ),
    )
    .orderBy(desc(aiInterviewSessions.createdAt))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

export async function loadAiSession(
  scope: CandidateScope,
  now: Date,
): Promise<CandidateSessionView | null> {
  const session = await sessionFor(getAdminDb(), scope);
  if (!session) return null;
  return {
    status: session.status,
    deadlineAt: session.deadlineAt.toISOString(),
    timeLimitMinutes: session.timeLimitMinutes,
    endsAt: session.startedAt
      ? new Date(session.startedAt.getTime() + session.timeLimitMinutes * 60_000).toISOString()
      : null,
    secondsLeft: secondsLeft(session.startedAt, session.timeLimitMinutes, now),
    questionCount: session.questions.length,
    currentQuestion: session.currentQuestion,
    humanRequested: Boolean(session.flags.humanRequested),
    turns: turnsOf(session),
  };
}

export type StepResult =
  | { ok: true; completed: boolean; sessionId: string }
  | { ok: false; error: "notOpen" | "expired" | "tooLong" | "empty" };

/** Starts the interview after the candidate agreed (M12-2): consent recorded, first question asked. */
export async function startAiInterview(scope: CandidateScope, now: Date): Promise<StepResult> {
  return getAdminDb().transaction(async (tx) => {
    const session = await sessionFor(tx, scope, true);
    if (!session || session.status !== "invited") return { ok: false, error: "notOpen" };
    if (session.deadlineAt <= now) return { ok: false, error: "expired" };
    const [app] = await tx
      .select({ candidateId: applications.candidateId, outcome: applications.outcome })
      .from(applications)
      .where(eq(applications.id, scope.applicationId));
    if (app?.outcome !== "active") return { ok: false, error: "notOpen" };
    await tx.insert(consents).values({
      orgId: scope.orgId,
      clientId: scope.clientId,
      candidateId: app.candidateId,
      applicationId: scope.applicationId,
      kind: "ai_interview",
      granted: true,
      textVersion: AI_CONSENT_VERSION,
    });
    const first = session.questions[0]!;
    const turns: Turn[] = [
      {
        role: "ai",
        questionId: first.id,
        kind: "question",
        text: first.text,
        at: now.toISOString(),
      },
    ];
    await tx
      .update(aiInterviewSessions)
      .set({
        status: "started",
        startedAt: now,
        transcriptEnc: encryptPii(JSON.stringify(turns)),
        turnCount: turns.length,
        currentQuestion: 0,
        followUpsUsed: 0,
      })
      .where(eq(aiInterviewSessions.id, session.id));
    await tx
      .update(applications)
      .set({ stage: "interview", waitingOn: "candidate", nextAction: "await_ai_interview" })
      .where(eq(applications.id, scope.applicationId));
    await recordEvent(tx, {
      ...scope,
      actor: "candidate",
      type: "ai_interview.started",
      payload: { sessionId: session.id },
    });
    return { ok: true, completed: false, sessionId: session.id };
  });
}

/** Marks the session completed (all answered, or time ran out) and hands it to scoring. */
async function complete(tx: Tx, session: Session, turns: Turn[], now: Date, partial: boolean) {
  await tx
    .update(aiInterviewSessions)
    .set({
      status: "completed",
      completedAt: now,
      transcriptEnc: encryptPii(JSON.stringify(turns)),
      turnCount: turns.length,
      flags: { ...session.flags, ...(partial ? { partial: true } : {}) },
    })
    .where(eq(aiInterviewSessions.id, session.id));
  await tx
    .update(applications)
    .set({ waitingOn: "system", nextAction: null })
    .where(eq(applications.id, session.applicationId));
  await recordEvent(tx, {
    orgId: session.orgId,
    clientId: session.clientId,
    applicationId: session.applicationId,
    actor: partial ? "system" : "candidate",
    type: "ai_interview.completed",
    payload: { sessionId: session.id, partial },
  });
}

/**
 * Records an answer and asks the next thing: a follow-up the question allows, the next question,
 * or the closing (M12-1). The row stays locked while the AI words a follow-up, so a double
 * submit waits instead of interleaving.
 */
export async function answerAiInterview(
  scope: CandidateScope,
  text: string,
  now: Date,
): Promise<StepResult> {
  const answer = text.trim();
  if (!answer) return { ok: false, error: "empty" };
  if (answer.length > MAX_ANSWER_CHARS) return { ok: false, error: "tooLong" };
  return getAdminDb().transaction(async (tx) => {
    const session = await sessionFor(tx, scope, true);
    if (!session || session.status !== "started") return { ok: false, error: "notOpen" };
    const turns = turnsOf(session);
    const question = session.questions[session.currentQuestion];
    if (!question) return { ok: false, error: "notOpen" };
    turns.push({
      role: "candidate",
      questionId: question.id,
      kind: "answer",
      text: answer,
      at: now.toISOString(),
    });
    // Out of time: the answer counts, and the interview ends here.
    if (
      secondsLeft(session.startedAt, session.timeLimitMinutes, now) === 0 ||
      session.deadlineAt <= now
    ) {
      await complete(tx, session, turns, now, true);
      return { ok: true, completed: true, sessionId: session.id };
    }
    const flags = looksLikeInjection(answer)
      ? { ...session.flags, injection: true }
      : session.flags;
    let followUp: string | null = null;
    if (session.followUpsUsed < question.followUps) {
      try {
        followUp = await proposeFollowUp({
          orgId: scope.orgId,
          question,
          exchange: exchangeFor(turns, question.id),
        });
      } catch {
        followUp = null; // An AI hiccup just moves the interview on.
      }
    }
    const step = nextStep(
      session.questions,
      { currentQuestion: session.currentQuestion, followUpsUsed: session.followUpsUsed },
      followUp,
    );
    const asked =
      step.kind === "closing"
        ? question.id
        : (session.questions[step.progress.currentQuestion]?.id ?? question.id);
    turns.push({
      role: "ai",
      questionId: asked,
      kind: step.kind,
      text: step.text,
      at: now.toISOString(),
    });
    if (step.kind === "closing") {
      await complete(tx, { ...session, flags }, turns, now, false);
      return { ok: true, completed: true, sessionId: session.id };
    }
    await tx
      .update(aiInterviewSessions)
      .set({
        transcriptEnc: encryptPii(JSON.stringify(turns)),
        turnCount: turns.length,
        currentQuestion: step.progress.currentQuestion,
        followUpsUsed: step.progress.followUpsUsed,
        flags,
      })
      .where(eq(aiInterviewSessions.id, session.id));
    return { ok: true, completed: false, sessionId: session.id };
  });
}

/**
 * The candidate asks for a person instead (M12-2): the AI interview ends unscored and the usual
 * invitation to book an interview takes its place.
 */
export async function requestHumanInterview(
  scope: CandidateScope,
): Promise<{ ok: true; invitationId: string | null } | { ok: false }> {
  return getAdminDb().transaction(async (tx) => {
    const session = await sessionFor(tx, scope, true);
    if (!session || (session.status !== "invited" && session.status !== "started")) {
      return { ok: false as const };
    }
    await tx
      .update(aiInterviewSessions)
      .set({ status: "aborted", flags: { ...session.flags, humanRequested: true } })
      .where(eq(aiInterviewSessions.id, session.id));
    await recordEvent(tx, {
      ...scope,
      actor: "candidate",
      type: "ai_interview.aborted",
      payload: { sessionId: session.id, reason: "human_requested" },
    });
    const [app] = await tx
      .select({ round: applications.currentRound })
      .from(applications)
      .where(eq(applications.id, scope.applicationId));
    const invitationId = await issueInvitation(tx, {
      ...scope,
      round: app?.round ?? 1,
      actor: "candidate",
    });
    return { ok: true as const, invitationId };
  });
}

/**
 * At the deadline (or when the time limit runs out unattended): an interview in progress is
 * completed with what was answered; one never started expires and goes to staff (M12-5).
 */
export async function closeOverdueSession(
  sessionId: string,
  orgId: string,
  now: Date,
): Promise<"completed" | "expired" | "none"> {
  return getAdminDb().transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(aiInterviewSessions)
      .where(and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.orgId, orgId)))
      .for("update");
    if (!session) return "none";
    const timedOut = secondsLeft(session.startedAt, session.timeLimitMinutes, now) === 0;
    if (session.status === "started" && (timedOut || session.deadlineAt <= now)) {
      await complete(tx, session, turnsOf(session), now, true);
      return "completed";
    }
    if (session.status === "invited" && session.deadlineAt <= now) {
      await tx
        .update(aiInterviewSessions)
        .set({ status: "expired" })
        .where(eq(aiInterviewSessions.id, session.id));
      await tx
        .update(applications)
        .set({ waitingOn: "staff", nextAction: "ai_interview_expired" })
        .where(eq(applications.id, session.applicationId));
      await recordEvent(tx, {
        orgId,
        clientId: session.clientId,
        applicationId: session.applicationId,
        actor: "system",
        type: "ai_interview.expired",
        payload: { sessionId },
      });
      return "expired";
    }
    return "none";
  });
}
