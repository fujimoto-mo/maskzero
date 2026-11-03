import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "@/server/db/client";
import {
  aiInterviewSessions,
  applications,
  interviewInvitations,
  interviews,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import {
  aiInterviewInvited,
  applicationRejected,
  interviewChanged,
  invitationCreated,
} from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";

// Invitation and interview bookkeeping shared by the pipeline, staff actions and candidate pages.
// Write inside the caller's transaction; send the background events after it commits.

type Conn = Db | Tx;
type Actor = { actor: "system" | "staff" | "candidate"; actorId?: string | null };

/**
 * Invites the application to book round N (docs/02 M7-1). One invitation per round: a repeated
 * call returns null and changes nothing.
 */
export async function issueInvitation(
  conn: Conn,
  input: { orgId: string; clientId: string; applicationId: string; round: number } & Actor,
): Promise<string | null> {
  const [row] = await conn
    .insert(interviewInvitations)
    .values({
      orgId: input.orgId,
      clientId: input.clientId,
      applicationId: input.applicationId,
      round: input.round,
    })
    .onConflictDoNothing({
      target: [interviewInvitations.applicationId, interviewInvitations.round],
    })
    .returning({ id: interviewInvitations.id });
  if (!row) return null;
  await conn
    .update(applications)
    .set({
      stage: "booking",
      currentRound: input.round,
      waitingOn: "candidate",
      nextAction: "await_booking",
    })
    .where(eq(applications.id, input.applicationId));
  await recordEvent(conn, {
    orgId: input.orgId,
    clientId: input.clientId,
    applicationId: input.applicationId,
    actor: input.actor,
    actorId: input.actorId ?? null,
    type: "invitation.sent",
    payload: { invitationId: row.id, round: input.round },
  });
  return row.id;
}

/**
 * For an application leaving the process (rejected, withdrawn, back to review): open invitations
 * are canceled and scheduled interviews too, and an open AI interview ends. Returns the canceled interviews, whose reminders
 * must be stopped once the transaction commits.
 */
export async function closeOpenScheduling(conn: Conn, applicationId: string): Promise<string[]> {
  await conn
    .update(interviewInvitations)
    .set({ status: "canceled" })
    .where(
      and(
        eq(interviewInvitations.applicationId, applicationId),
        inArray(interviewInvitations.status, ["sent", "opened"]),
      ),
    );
  await conn
    .update(aiInterviewSessions)
    .set({ status: "aborted" })
    .where(
      and(
        eq(aiInterviewSessions.applicationId, applicationId),
        inArray(aiInterviewSessions.status, ["invited", "started"]),
      ),
    );
  const canceled = await conn
    .update(interviews)
    .set({ status: "canceled" })
    .where(and(eq(interviews.applicationId, applicationId), eq(interviews.status, "scheduled")))
    .returning({ id: interviews.id });
  return canceled.map((c) => c.id);
}

/** The background work after a commit: invitation emails, stopped reminders, rejection notices. */
export async function afterSchedulingChange(input: {
  orgId: string;
  invitationId?: string | null;
  aiSessionId?: string | null;
  canceledInterviews?: string[];
  rejectedApplications?: string[];
}): Promise<void> {
  const { orgId } = input;
  if (input.invitationId) {
    await sendEventBestEffort(
      invitationCreated.create({ invitationId: input.invitationId, orgId }),
    );
  }
  if (input.aiSessionId) {
    await sendEventBestEffort(aiInterviewInvited.create({ sessionId: input.aiSessionId, orgId }));
  }
  for (const interviewId of input.canceledInterviews ?? []) {
    await sendEventBestEffort(interviewChanged.create({ interviewId, orgId }));
  }
  for (const applicationId of input.rejectedApplications ?? []) {
    await sendEventBestEffort(applicationRejected.create({ applicationId, orgId }));
  }
}
