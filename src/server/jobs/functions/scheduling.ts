import { and, eq, inArray, sql } from "drizzle-orm";
import { morningAfter, outsideQuietHours, reminderAt } from "@/features/scheduling/slots";
import { getAdminDb } from "@/server/db/admin";
import { applications, interviewInvitations, interviews } from "@/server/db/schema";
import { sendCandidateMessage } from "@/server/messaging/send";
import { inngest } from "../client";
import {
  applicationRejected,
  interviewChanged,
  interviewScheduled,
  invitationCreated,
  invitationResend,
} from "../events";

// Scheduling emails (docs/05 §7). Step results carry IDs, times and outcome codes only.

const MAX_FOLLOW_UPS = 2;
const FOLLOW_UP_DAYS = 3;

async function loadInvitation(invitationId: string, orgId: string) {
  const [row] = await getAdminDb()
    .select({
      applicationId: interviewInvitations.applicationId,
      round: interviewInvitations.round,
      status: interviewInvitations.status,
      sentAt: interviewInvitations.sentAt,
      outcome: applications.outcome,
    })
    .from(interviewInvitations)
    .innerJoin(applications, eq(applications.id, interviewInvitations.applicationId))
    .where(and(eq(interviewInvitations.id, invitationId), eq(interviewInvitations.orgId, orgId)));
  return row ?? null;
}

const stillOpen = (row: Awaited<ReturnType<typeof loadInvitation>>) =>
  Boolean(row && row.outcome === "active" && (row.status === "sent" || row.status === "opened"));

/** The invitation email, then up to two follow-ups three days apart while it isn't booked (M7-4). */
export const invitationLifecycle = inngest.createFunction(
  { id: "invitation-lifecycle", triggers: [invitationCreated] },
  async ({ event, step }) => {
    const { invitationId, orgId } = event.data;
    const invitation = await step.run("load", () => loadInvitation(invitationId, orgId));
    if (!invitation) return { skipped: "notFound" };

    // Automatic sends wait out quiet hours, 21:00–08:00 in Japan (docs/02 M9-6). Meanwhile the
    // candidate may have booked through a link staff shared, or left the process.
    await step.sleepUntil("quiet-hours", outsideQuietHours(new Date(event.ts ?? Date.now())));
    const sent = await step.run("send-invitation", async () => {
      if (!stillOpen(await loadInvitation(invitationId, orgId))) return "closed";
      return sendCandidateMessage({
        applicationId: invitation.applicationId,
        orgId,
        trigger: invitation.round > 1 ? "next_round" : "pass",
        dedupeKey: `${invitation.applicationId}:invitation:${invitation.round}`,
      });
    });
    if (sent === "closed") return { followUps: 0 };

    for (let n = 1; n <= MAX_FOLLOW_UPS; n++) {
      await step.sleepUntil(
        `wait-follow-up-${n}`,
        morningAfter(new Date(invitation.sentAt), FOLLOW_UP_DAYS * n),
      );
      const sent = await step.run(`follow-up-${n}`, async () => {
        const current = await loadInvitation(invitationId, orgId);
        if (!stillOpen(current)) return false;
        await sendCandidateMessage({
          applicationId: invitation.applicationId,
          orgId,
          trigger: "follow_up",
          dedupeKey: `${invitation.applicationId}:follow_up:${invitation.round}:${n}`,
        });
        await getAdminDb()
          .update(interviewInvitations)
          .set({ followupCount: sql`${interviewInvitations.followupCount} + 1` })
          .where(eq(interviewInvitations.id, invitationId));
        return true;
      });
      if (!sent) return { followUps: n - 1 };
    }
    return { followUps: MAX_FOLLOW_UPS };
  },
);

/** Staff pressed "resend" (M7-2): the invitation email again, once per request. */
export const invitationResendEmail = inngest.createFunction(
  { id: "invitation-resend", triggers: [invitationResend] },
  async ({ event, step }) => {
    const { invitationId, orgId, requestedAt } = event.data;
    return step.run("send", async () => {
      const invitation = await loadInvitation(invitationId, orgId);
      if (!stillOpen(invitation)) return "closed";
      return sendCandidateMessage({
        applicationId: invitation!.applicationId,
        orgId,
        trigger: invitation!.round > 1 ? "next_round" : "pass",
        dedupeKey: `${invitation!.applicationId}:invitation:${invitation!.round}:resend:${requestedAt}`,
      });
    });
  },
);

async function loadInterview(interviewId: string, orgId: string) {
  const [row] = await getAdminDb()
    .select({
      applicationId: interviews.applicationId,
      startsAt: interviews.startsAt,
      status: interviews.status,
    })
    .from(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
  return row ?? null;
}

/**
 * Confirmation with .ics at once, then the day-before reminder at 18:00 (M9-1). A reschedule or
 * cancellation sends `interview/changed`, which cancels this run and so the pending reminder.
 */
export const interviewLifecycle = inngest.createFunction(
  {
    id: "interview-lifecycle",
    triggers: [interviewScheduled],
    cancelOn: [{ event: interviewChanged.name, match: "data.interviewId" }],
  },
  async ({ event, step }) => {
    const { interviewId, orgId } = event.data;
    const interview = await step.run("load", () => loadInterview(interviewId, orgId));
    if (!interview || interview.status !== "scheduled") return { skipped: "notScheduled" };

    await step.run("confirmation", () =>
      sendCandidateMessage({
        applicationId: interview.applicationId,
        orgId,
        trigger: "confirmed",
        dedupeKey: `${interviewId}:confirmed`,
        interviewId,
      }),
    );

    const remindAt = await step.run(
      "reminder-time",
      () => reminderAt(new Date(interview.startsAt), new Date())?.toISOString() ?? null,
    );
    if (!remindAt) return { reminder: "tooLate" };
    await step.sleepUntil("wait-for-reminder", remindAt);
    const reminder = await step.run("reminder", async () => {
      const current = await loadInterview(interviewId, orgId);
      if (current?.status !== "scheduled") return "notScheduled";
      return sendCandidateMessage({
        applicationId: interview.applicationId,
        orgId,
        trigger: "reminder",
        dedupeKey: `${interviewId}:reminder`,
        interviewId,
      });
    });
    return { reminder };
  },
);

/** A confirmed rejection is announced at 10:00 the next morning, if it still stands (M9-1). */
export const rejectionNotice = inngest.createFunction(
  { id: "rejection-notice", triggers: [applicationRejected] },
  async ({ event, step }) => {
    const { applicationId, orgId } = event.data;
    await step.sleepUntil("wait-until-morning", morningAfter(new Date(event.ts ?? Date.now()), 1));
    return step.run("send", async () => {
      const [app] = await getAdminDb()
        .select({ outcome: applications.outcome })
        .from(applications)
        .where(
          and(
            eq(applications.id, applicationId),
            eq(applications.orgId, orgId),
            inArray(applications.outcome, ["rejected"]),
          ),
        );
      if (!app) return "notRejected";
      return sendCandidateMessage({
        applicationId,
        orgId,
        trigger: "rejection",
        dedupeKey: `${applicationId}:rejection`,
      });
    });
  },
);
