import { and, eq } from "drizzle-orm";
import { formatDeadline, reminderTimes } from "@/features/ai-interview/domain";
import { markScoringFailed, scoreSession } from "@/features/ai-interview/scoring";
import { closeOverdueSession } from "@/features/ai-interview/candidate-server";
import { outsideQuietHours } from "@/features/scheduling/slots";
import { getAdminDb } from "@/server/db/admin";
import { aiInterviewSessions, applications } from "@/server/db/schema";
import { sendCandidateMessage } from "@/server/messaging/send";
import { aiInterviewUrl, portalTokenFor } from "@/server/portal";
import { inngest } from "../client";
import {
  aiInterviewCompleted,
  aiInterviewInvited,
  aiInterviewStarted,
  staffNotify,
} from "../events";

// The AI interviewer's background work (docs/02 M12). Step results carry IDs, codes, times and
// scores only: the transcript and the AI's comments stay in the database.

async function loadSession(sessionId: string, orgId: string) {
  const [row] = await getAdminDb()
    .select({
      applicationId: aiInterviewSessions.applicationId,
      status: aiInterviewSessions.status,
      deadlineAt: aiInterviewSessions.deadlineAt,
      attempt: aiInterviewSessions.attempt,
      outcome: applications.outcome,
    })
    .from(aiInterviewSessions)
    .innerJoin(applications, eq(applications.id, aiInterviewSessions.applicationId))
    .where(and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.orgId, orgId)));
  return row ?? null;
}

const notStarted = (row: Awaited<ReturnType<typeof loadSession>>) =>
  Boolean(row && row.outcome === "active" && row.status === "invited");

async function sendAiEmail(
  sessionId: string,
  orgId: string,
  trigger: "ai_invite" | "ai_remind",
  dedupeKey: string,
) {
  const session = await loadSession(sessionId, orgId);
  if (!notStarted(session)) return "closed";
  const token = await portalTokenFor(getAdminDb(), session!.applicationId);
  return sendCandidateMessage({
    applicationId: session!.applicationId,
    orgId,
    trigger,
    dedupeKey,
    overrides: {
      interview_url: aiInterviewUrl(token),
      deadline: formatDeadline(new Date(session!.deadlineAt)),
    },
  });
}

/**
 * The invitation email (after quiet hours), reminders two days before the deadline and on its
 * day while it isn't started (M12-5), then the deadline: an unstarted interview expires and goes
 * to a person; one in progress is completed with what was answered.
 */
export const aiInterviewLifecycle = inngest.createFunction(
  { id: "ai-interview-lifecycle", triggers: [aiInterviewInvited] },
  async ({ event, step }) => {
    const { sessionId, orgId } = event.data;
    const session = await step.run("load", () => loadSession(sessionId, orgId));
    if (!session) return { skipped: "notFound" };

    await step.sleepUntil("quiet-hours", outsideQuietHours(new Date(event.ts ?? Date.now())));
    const sent = await step.run("send-invitation", () =>
      sendAiEmail(sessionId, orgId, "ai_invite", `${sessionId}:ai_invite`),
    );
    if (sent !== "closed") {
      const reminders = reminderTimes(new Date(session.deadlineAt), new Date());
      for (const [n, at] of reminders.entries()) {
        await step.sleepUntil(`wait-reminder-${n + 1}`, at);
        const reminded = await step.run(`reminder-${n + 1}`, () =>
          sendAiEmail(sessionId, orgId, "ai_remind", `${sessionId}:ai_remind:${n + 1}`),
        );
        if (reminded === "closed") break;
      }
    }

    await step.sleepUntil("deadline", new Date(session.deadlineAt));
    const closed = await step.run("close", () => closeOverdueSession(sessionId, orgId, new Date()));
    if (closed === "completed") {
      await step.sendEvent("score", aiInterviewCompleted.create({ sessionId, orgId }));
    }
    if (closed === "expired") {
      await step.sendEvent(
        "notify-staff",
        staffNotify.create({ orgId, applicationId: session.applicationId, kind: "ai_interview" }),
      );
    }
    return { closed };
  },
);

/** A started interview left open: closed with what was answered once its time limit has run out. */
export const aiInterviewTimeLimit = inngest.createFunction(
  { id: "ai-interview-time-limit", triggers: [aiInterviewStarted] },
  async ({ event, step }) => {
    const { sessionId, orgId } = event.data;
    const endsAt = await step.run("ends-at", async () => {
      const [row] = await getAdminDb()
        .select({
          startedAt: aiInterviewSessions.startedAt,
          limit: aiInterviewSessions.timeLimitMinutes,
        })
        .from(aiInterviewSessions)
        .where(and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.orgId, orgId)));
      // A minute of grace for an answer sent at the last moment.
      return row?.startedAt
        ? new Date(row.startedAt.getTime() + (row.limit + 1) * 60_000).toISOString()
        : null;
    });
    if (!endsAt) return { skipped: "notStarted" };
    await step.sleepUntil("time-limit", new Date(endsAt));
    const closed = await step.run("close", () => closeOverdueSession(sessionId, orgId, new Date()));
    if (closed === "completed") {
      await step.sendEvent("score", aiInterviewCompleted.create({ sessionId, orgId }));
    }
    return { closed };
  },
);

/**
 * Scores a completed interview (M12-3): per-question scores with evidence, the average and a
 * band, for people to review. It never decides: the application waits for a person (M12-4).
 */
export const aiInterviewScoring = inngest.createFunction(
  {
    id: "ai-interview-scoring",
    triggers: [aiInterviewCompleted],
    concurrency: { limit: 5 },
    retries: 3,
    onFailure: async ({ event, step }) => {
      const { sessionId, orgId } = event.data.event.data;
      const applicationId = await step.run("mark-failed", () =>
        markScoringFailed(sessionId, orgId),
      );
      if (applicationId) {
        await step.sendEvent(
          "notify-staff",
          staffNotify.create({ orgId, applicationId, kind: "ai_interview" }),
        );
      }
    },
  },
  async ({ event, step }) => {
    const { sessionId, orgId } = event.data;
    const result = await step.run("score", () => scoreSession(sessionId, orgId));
    if (result.applicationId) {
      await step.sendEvent(
        "notify-staff",
        staffNotify.create({ orgId, applicationId: result.applicationId, kind: "ai_interview" }),
      );
    }
    return { total: result.total, band: result.band };
  },
);
