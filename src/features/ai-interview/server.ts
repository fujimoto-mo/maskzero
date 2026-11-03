import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { issueInvitation } from "@/features/interviews/server";
import type { Db, Tx } from "@/server/db/client";
import {
  aiInterviewConfigs,
  aiInterviewSessions,
  applications,
  organizations,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { AI_FEATURE, deadlineFor } from "./domain";

// Inviting to the AI interviewer (docs/02 M12-1). Callers pass their connection: a withRls()
// transaction for staff, the admin connection for the pipeline.

type Conn = Db | Tx;
type Actor = { actor: "system" | "staff" | "candidate"; actorId?: string | null };

export async function hasFeature(conn: Conn, orgId: string, flag: string): Promise<boolean> {
  const [org] = await conn
    .select({ flags: organizations.featureFlags })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return Boolean(org?.flags.includes(flag));
}

/** The application's job's AI interview, if the company has the feature and the job uses it. */
export async function aiConfigFor(conn: Conn, orgId: string, applicationId: string) {
  if (!(await hasFeature(conn, orgId, AI_FEATURE))) return null;
  const [row] = await conn
    .select({
      enabled: aiInterviewConfigs.enabled,
      questions: aiInterviewConfigs.questions,
      timeLimitMinutes: aiInterviewConfigs.timeLimitMinutes,
      deadlineDays: aiInterviewConfigs.deadlineDays,
    })
    .from(applications)
    .innerJoin(aiInterviewConfigs, eq(aiInterviewConfigs.jobId, applications.jobId))
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
  return row?.enabled && row.questions.length > 0 ? row : null;
}

/**
 * Invites the application to the job's AI interview (round 1), unless one is already open.
 * Returns the session, or null when the job has no AI interview.
 */
export async function inviteToAiInterview(
  conn: Conn,
  input: { orgId: string; clientId: string; applicationId: string; attempt?: number } & Actor,
): Promise<string | null> {
  const config = await aiConfigFor(conn, input.orgId, input.applicationId);
  if (!config) return null;
  const [open] = await conn
    .select({ id: aiInterviewSessions.id })
    .from(aiInterviewSessions)
    .where(
      and(
        eq(aiInterviewSessions.applicationId, input.applicationId),
        inArray(aiInterviewSessions.status, ["invited", "started"]),
      ),
    );
  if (open) return null;
  const [session] = await conn
    .insert(aiInterviewSessions)
    .values({
      orgId: input.orgId,
      clientId: input.clientId,
      applicationId: input.applicationId,
      questions: config.questions,
      timeLimitMinutes: config.timeLimitMinutes,
      deadlineAt: deadlineFor(new Date(), config.deadlineDays),
      attempt: input.attempt ?? 1,
    })
    .returning({ id: aiInterviewSessions.id });
  await conn
    .update(applications)
    .set({ stage: "booking", waitingOn: "candidate", nextAction: "await_ai_interview" })
    .where(eq(applications.id, input.applicationId));
  await recordEvent(conn, {
    orgId: input.orgId,
    clientId: input.clientId,
    applicationId: input.applicationId,
    actor: input.actor,
    actorId: input.actorId ?? null,
    type: "ai_interview.invited",
    payload: { sessionId: session!.id, attempt: input.attempt ?? 1 },
  });
  return session!.id;
}

/**
 * What a pass leads to (docs/02 M7-1, M12-1): the AI interview where the job uses one, otherwise
 * an invitation to book an interview with a person.
 */
export async function inviteAfterPass(
  conn: Conn,
  input: { orgId: string; clientId: string; applicationId: string; round: number } & Actor,
): Promise<{ invitationId: string | null; aiSessionId: string | null }> {
  if (input.round === 1 && (await aiConfigFor(conn, input.orgId, input.applicationId))) {
    // Like booking invitations, one per round: a second pass changes nothing (staff re-invite
    // from the AI interview's page).
    if (await latestSession(conn, input.applicationId)) {
      return { invitationId: null, aiSessionId: null };
    }
    return { invitationId: null, aiSessionId: await inviteToAiInterview(conn, input) };
  }
  return { invitationId: await issueInvitation(conn, input), aiSessionId: null };
}

/** The application's latest AI interview, for staff pages and the candidate drawer. */
export async function latestSession(conn: Conn, applicationId: string) {
  const [row] = await conn
    .select()
    .from(aiInterviewSessions)
    .where(eq(aiInterviewSessions.applicationId, applicationId))
    .orderBy(desc(aiInterviewSessions.createdAt))
    .limit(1);
  return row ?? null;
}
