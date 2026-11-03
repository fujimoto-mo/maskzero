import "server-only";
import { and, eq } from "drizzle-orm";
import { closeOpenScheduling, issueInvitation } from "@/features/interviews/server";
import type { Tx } from "@/server/db/client";
import { applications } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { allowedChanges, type Outcome, type Stage, type StageChange } from "./stages";

// Moving an application through the process (docs/02 M5-3, M11-4), inside the caller's withRls()
// transaction. Background events (invitation emails, stopped reminders, rejection notices) are
// the caller's to send after commit, so a decision can hold them back for its undo window.

const CHANGE_STATE: Record<
  Exclude<StageChange, "next_round">,
  {
    stage?: Stage;
    outcome: Outcome;
    waitingOn: "candidate" | "staff" | null;
    nextAction: string | null;
  }
> = {
  offer: {
    stage: "offer",
    outcome: "active",
    waitingOn: "candidate",
    nextAction: "await_offer_reply",
  },
  hired: { stage: "hired", outcome: "hired", waitingOn: null, nextAction: null },
  withdrawn: { outcome: "withdrawn", waitingOn: null, nextAction: null },
  rejected: { outcome: "rejected", waitingOn: null, nextAction: null },
  reopen: { outcome: "active", waitingOn: "staff", nextAction: "review_screening" },
};

/** The application fields a change touches, as they were, to put back on undo. */
export type PreviousState = {
  stage: Stage;
  outcome: Outcome;
  currentRound: number;
  waitingOn: "candidate" | "staff" | "system" | null;
  nextAction: string | null;
  closeReason: string | null;
};

export type StageChangeResult = {
  invitationId: string | null;
  canceledInterviews: string[];
  previous: PreviousState;
};

/** Null when the change isn't allowed from the application's current state. */
export async function applyStageChange(
  tx: Tx,
  actor: { orgId: string; clientId: string; userId: string },
  applicationId: string,
  change: StageChange,
  note: string | null,
): Promise<StageChangeResult | null> {
  const [app] = await tx
    .select({
      stage: applications.stage,
      outcome: applications.outcome,
      currentRound: applications.currentRound,
      waitingOn: applications.waitingOn,
      nextAction: applications.nextAction,
      closeReason: applications.closeReason,
    })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.orgId, actor.orgId),
        eq(applications.clientId, actor.clientId),
      ),
    );
  if (!app || !allowedChanges(app.stage, app.outcome).includes(change)) return null;

  const set =
    change === "next_round"
      ? {
          stage: "booking" as const,
          currentRound: app.currentRound + 1,
          waitingOn: "staff" as const,
          nextAction: "invite_interview",
        }
      : {
          ...CHANGE_STATE[change],
          closeReason:
            change === "withdrawn" || change === "rejected"
              ? (note ?? change)
              : change === "hired"
                ? "hired"
                : null,
        };
  await tx.update(applications).set(set).where(eq(applications.id, applicationId));
  // The reason may describe the person, so it stays on the application, not in the event.
  await recordEvent(tx, {
    orgId: actor.orgId,
    clientId: actor.clientId,
    applicationId,
    actor: "staff",
    actorId: actor.userId,
    type: "application.stage_changed",
    payload: { change, from: app.stage, fromOutcome: app.outcome },
  });
  // The next round gets its own invitation; leaving the process closes what was open.
  const invitationId =
    change === "next_round"
      ? await issueInvitation(tx, {
          orgId: actor.orgId,
          clientId: actor.clientId,
          applicationId,
          round: app.currentRound + 1,
          actor: "staff",
          actorId: actor.userId,
        })
      : null;
  const canceledInterviews =
    change === "withdrawn" || change === "rejected" || change === "hired"
      ? await closeOpenScheduling(tx, applicationId)
      : [];
  return { invitationId, canceledInterviews, previous: app };
}
