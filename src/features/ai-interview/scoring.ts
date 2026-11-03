import "server-only";
import { and, eq } from "drizzle-orm";
import { quoteIsInText } from "@/features/screening/text";
import { AI_INTERVIEW_RUBRIC_VERSION, scoreAiInterview } from "@/server/ai/ai-interviewer";
import { decryptPii } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import { type AiQuestionScore, aiInterviewSessions, applications } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { type Band, bandFor, type Turn } from "./domain";

// Scoring a completed AI interview (docs/02 M12-3), for the background job. The AI proposes
// per-question scores with quotes; the code checks the quotes, averages and bands. It never
// decides: the application waits for a person (M12-4).

/** Marks which quotes appear in the candidate's answers; the others show as unverified. */
function verifiedEvidence(quotes: string[], answers: string): AiQuestionScore["evidence"] {
  return quotes.map((quote) => ({ quote, verified: quoteIsInText(quote, answers) }));
}

export async function scoreSession(
  sessionId: string,
  orgId: string,
): Promise<{ applicationId: string | null; total: number | null; band: Band | null }> {
  const db = getAdminDb();
  const [session] = await db
    .select()
    .from(aiInterviewSessions)
    .where(and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.orgId, orgId)));
  if (!session || session.status !== "completed") {
    return { applicationId: null, total: null, band: null };
  }
  const turns: Turn[] = session.transcriptEnc
    ? (JSON.parse(decryptPii(session.transcriptEnc)) as Turn[])
    : [];
  const answered = session.questions.filter((q) =>
    turns.some((t) => t.questionId === q.id && t.role === "candidate"),
  );
  const draft =
    answered.length > 0
      ? await scoreAiInterview({ orgId, questions: session.questions, turns })
      : { scores: [], summary: "", model: null };
  const scores: AiQuestionScore[] = session.questions.map((q) => {
    const answers = turns
      .filter((t) => t.questionId === q.id && t.role === "candidate")
      .map((t) => t.text)
      .join("\n");
    const proposed = draft.scores.find((s) => s.questionId === q.id);
    // An unanswered question scores 1: there is nothing that meets the guidance.
    if (!answers || !proposed) {
      return { questionId: q.id, score: 1, comment: "", evidence: [] };
    }
    return {
      questionId: q.id,
      score: proposed.score,
      comment: proposed.comment,
      evidence: verifiedEvidence(proposed.quotes, answers),
    };
  });
  const total =
    Math.round((scores.reduce((sum, s) => sum + s.score, 0) / Math.max(scores.length, 1)) * 100) /
    100;
  const band = bandFor(total);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(aiInterviewSessions)
      .set({
        status: "scored",
        scores,
        total: total.toFixed(2),
        band,
        summary: draft.summary,
        model: draft.model,
        rubricVersion: AI_INTERVIEW_RUBRIC_VERSION,
      })
      .where(
        and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.status, "completed")),
      )
      .returning({ id: aiInterviewSessions.id });
    if (!updated) return { applicationId: null, total: null, band: null };
    await tx
      .update(applications)
      .set({ stage: "evaluation", waitingOn: "staff", nextAction: "review_ai_interview" })
      .where(and(eq(applications.id, session.applicationId), eq(applications.outcome, "active")));
    await recordEvent(tx, {
      orgId,
      clientId: session.clientId,
      applicationId: session.applicationId,
      actor: "system",
      type: "ai_interview.scored",
      payload: { sessionId, total, band },
    });
    return { applicationId: session.applicationId, total, band };
  });
}

/** Scoring gave up: the answers wait for a person without a score. */
export async function markScoringFailed(sessionId: string, orgId: string): Promise<string | null> {
  return getAdminDb().transaction(async (tx) => {
    const [session] = await tx
      .select({
        applicationId: aiInterviewSessions.applicationId,
        clientId: aiInterviewSessions.clientId,
        flags: aiInterviewSessions.flags,
        status: aiInterviewSessions.status,
      })
      .from(aiInterviewSessions)
      .where(and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.orgId, orgId)));
    if (!session || session.status !== "completed") return null;
    await tx
      .update(aiInterviewSessions)
      .set({ flags: { ...session.flags, scoringFailed: true } })
      .where(eq(aiInterviewSessions.id, sessionId));
    await tx
      .update(applications)
      .set({ stage: "evaluation", waitingOn: "staff", nextAction: "review_ai_interview" })
      .where(and(eq(applications.id, session.applicationId), eq(applications.outcome, "active")));
    await recordEvent(tx, {
      orgId,
      clientId: session.clientId,
      applicationId: session.applicationId,
      actor: "system",
      type: "ai_interview.scoring_failed",
      payload: { sessionId },
    });
    return session.applicationId;
  });
}
