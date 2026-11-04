import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  interviewReminders,
  morningAfter,
  outsideQuietHours,
  timingAt,
} from "@/features/scheduling/slots";
import { POOL_CHANNEL } from "@/features/intake/channels";
import type { Anchor } from "@/features/scheduling/templates";
import { getPublicEnv } from "@/lib/env";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  customMessages,
  documents,
  entryUrls,
  interviewInvitations,
  interviews,
  jobs,
  poolSuggestions,
  clients,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { IntegrationError } from "@/server/integrations/oauth";
import { prepareMeeting } from "@/server/integrations/meetings";
import { sendCandidateMessage } from "@/server/messaging/send";
import { resolveTiming } from "@/server/messaging/timing";
import { inngest } from "../client";
import {
  applicationRejected,
  applicationSubmitted,
  interviewChanged,
  interviewFinished,
  interviewScheduled,
  invitationCreated,
  meetingBotRequested,
  invitationResend,
  poolSuggested,
} from "../events";

// Scheduling emails (docs/05 §7). Step results carry IDs, times and outcome codes only. Every
// send rechecks state first, and its dedupe key keeps retries from sending twice.

const MAX_FOLLOW_UPS = 2;
/** Tries at creating an interview's meeting before staff are told (the function's retries). */
const MEETING_ATTEMPTS = 3;
const FOLLOW_UP_DAYS = 3;
/** Documents may still be uploading right after an entry. */
const CV_GRACE_MS = 60 * 60_000;

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
      const followed = await step.run(`follow-up-${n}`, async () => {
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
      if (!followed) return { followUps: n - 1 };
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
      clientId: interviews.clientId,
      invitationId: interviews.invitationId,
      startsAt: interviews.startsAt,
      status: interviews.status,
    })
    .from(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
  return row ?? null;
}

/**
 * Confirmation with .ics at once, then the reminders: 5 and 3 days before at 10:00, the day
 * before at 18:00, the day itself at 08:00 (M9-1, M9-2). A reschedule or cancellation sends
 * `interview/changed`, which cancels this run and so every pending reminder.
 */
export const interviewLifecycle = inngest.createFunction(
  {
    id: "interview-lifecycle",
    triggers: [interviewScheduled],
    cancelOn: [{ event: interviewChanged.name, match: "data.interviewId" }],
  },
  async ({ event, step, attempt }) => {
    const { interviewId, orgId } = event.data;
    const interview = await step.run("load", () => loadInterview(interviewId, orgId));
    if (!interview || interview.status !== "scheduled") return { skipped: "notScheduled" };

    // The Zoom or Teams meeting, the Meet link and the calendar event come first: the
    // confirmation carries the link (M8-6). Without it, staff are told and the email says the
    // link follows.
    const meeting = await step.run("meeting", async () => {
      try {
        return await prepareMeeting(interviewId, orgId);
      } catch (error) {
        const code = error instanceof IntegrationError ? error.code : "provider";
        // A provider hiccup gets the step's retries; a missing or refused account won't recover.
        if (code === "provider" && attempt < MEETING_ATTEMPTS - 1) throw error;
        await recordEvent(getAdminDb(), {
          orgId,
          clientId: interview.clientId,
          applicationId: interview.applicationId,
          actor: "system",
          type: "meeting.failed",
          payload: { interviewId, code },
        });
        return { status: "failed" as const, code };
      }
    });
    if (meeting.status === "skipped") return { skipped: meeting.reason };
    await step.sendEvent("bot", meetingBotRequested.create({ interviewId, orgId }));

    await step.run("confirmation", () =>
      sendCandidateMessage({
        applicationId: interview.applicationId,
        orgId,
        trigger: "confirmed",
        dedupeKey: `${interviewId}:confirmed`,
        interviewId,
      }),
    );

    const reminders = await step.run("reminder-times", () =>
      interviewReminders(new Date(interview.startsAt), new Date()).map((r) => ({
        trigger: r.trigger,
        at: r.at.toISOString(),
      })),
    );
    const sent: string[] = [];
    for (const reminder of reminders) {
      await step.sleepUntil(`wait-${reminder.trigger}`, reminder.at);
      const outcome = await step.run(reminder.trigger, async () => {
        const current = await loadInterview(interviewId, orgId);
        if (current?.status !== "scheduled") return "notScheduled";
        return sendCandidateMessage({
          applicationId: interview.applicationId,
          orgId,
          trigger: reminder.trigger,
          dedupeKey: `${interviewId}:${reminder.trigger}`,
          interviewId,
        });
      });
      if (outcome === "notScheduled") break;
      sent.push(reminder.trigger);
    }
    return { reminders: sent };
  },
);

/** After staff mark an interview: a thank-you (done) or a re-booking request (no-show) (M9-2). */
export const interviewFollowUp = inngest.createFunction(
  { id: "interview-follow-up", triggers: [interviewFinished] },
  async ({ event, step }) => {
    const { interviewId, orgId, outcome } = event.data;
    const trigger = outcome === "done" ? "thanks" : "no_show";
    const interview = await step.run("load", () => loadInterview(interviewId, orgId));
    if (!interview) return { skipped: "notFound" };
    const at = await step.run("send-time", async () => {
      const timing = await resolveTiming(orgId, interview.clientId, trigger);
      const when = timingAt(timing, new Date(event.ts ?? Date.now())) ?? new Date();
      return outsideQuietHours(when).toISOString();
    });
    await step.sleepUntil("wait", at);
    return step.run("send", async () => {
      const current = await loadInterview(interviewId, orgId);
      if (current?.status !== outcome) return "changed";
      const [app] = await getAdminDb()
        .select({ outcome: applications.outcome })
        .from(applications)
        .where(eq(applications.id, interview.applicationId));
      if (app?.outcome !== "active") return "closed";
      // A no-show who already booked again needs no reminder to do so.
      if (outcome === "no_show" && current.invitationId) {
        const invitation = await loadInvitation(current.invitationId, orgId);
        if (!stillOpen(invitation)) return "rebooked";
      }
      return sendCandidateMessage({
        applicationId: interview.applicationId,
        orgId,
        trigger,
        dedupeKey: `${interviewId}:${trigger}`,
        interviewId,
      });
    });
  },
);

/** A confirmed rejection is announced at the company's chosen time, if it still stands (M9-1). */
export const rejectionNotice = inngest.createFunction(
  { id: "rejection-notice", triggers: [applicationRejected] },
  async ({ event, step }) => {
    const { applicationId, orgId } = event.data;
    const at = await step.run("send-time", async () => {
      const [app] = await getAdminDb()
        .select({ clientId: applications.clientId })
        .from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
      if (!app) return null;
      const timing = await resolveTiming(orgId, app.clientId, "rejection");
      const when = timingAt(timing, new Date(event.ts ?? Date.now())) ?? new Date();
      return outsideQuietHours(when).toISOString();
    });
    if (!at) return "notFound";
    await step.sleepUntil("wait", at);
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

/** Entries for jobs that ask for a CV, still without one at the chosen time, get a reminder. */
export const cvReminder = inngest.createFunction(
  { id: "cv-reminder", triggers: [applicationSubmitted] },
  async ({ event, step }) => {
    const { applicationId, orgId } = event.data;
    const at = await step.run("send-time", async () => {
      const [app] = await getAdminDb()
        .select({
          clientId: applications.clientId,
          source: applications.source,
          requiresCv: jobs.requiresCv,
        })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
      if (!app || app.source !== "entry" || !app.requiresCv) return null;
      const anchor = new Date(event.ts ?? Date.now());
      const timing = await resolveTiming(orgId, app.clientId, "cv_missing");
      const when = timingAt(timing, anchor) ?? anchor;
      const earliest = new Date(anchor.getTime() + CV_GRACE_MS);
      return outsideQuietHours(when > earliest ? when : earliest).toISOString();
    });
    if (!at) return "notNeeded";
    await step.sleepUntil("wait", at);
    return step.run("send", async () => {
      const db = getAdminDb();
      const [app] = await db
        .select({ outcome: applications.outcome })
        .from(applications)
        .where(eq(applications.id, applicationId));
      if (app?.outcome !== "active") return "closed";
      const [cv] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.applicationId, applicationId),
            eq(documents.kind, "cv"),
            inArray(documents.status, ["uploading", "ready"]),
          ),
        )
        .limit(1);
      if (cv) return "hasCv";
      return sendCandidateMessage({
        applicationId,
        orgId,
        trigger: "cv_missing",
        dedupeKey: `${applicationId}:cv_missing`,
      });
    });
  },
);

/** What each event means for custom emails (M9-2). */
function anchorOf(
  name: string,
  data: Record<string, unknown>,
): { anchor: Anchor; key: string } | null {
  switch (name) {
    case applicationSubmitted.name:
      return { anchor: "applied", key: "applied" };
    case invitationCreated.name:
      return { anchor: "passed", key: String(data.invitationId) };
    case interviewScheduled.name:
      return { anchor: "interview_scheduled", key: String(data.interviewId) };
    case interviewFinished.name:
      return {
        anchor: data.outcome === "done" ? "interview_done" : "no_show",
        key: String(data.interviewId),
      };
    case applicationRejected.name:
      return { anchor: "rejected", key: "rejected" };
    default:
      return null;
  }
}

/**
 * The company's custom emails: each follows an event (application, pass, booking, interview held
 * or missed, rejection) at its chosen time, if the situation still holds then (M9-2).
 */
export const customEmails = inngest.createFunction(
  {
    id: "custom-emails",
    triggers: [
      applicationSubmitted,
      invitationCreated,
      interviewScheduled,
      interviewFinished,
      applicationRejected,
    ],
    cancelOn: [{ event: interviewChanged.name, match: "data.interviewId" }],
  },
  async ({ event, step }) => {
    const data = event.data as Record<string, unknown>;
    const orgId = String(data.orgId);
    const found = anchorOf(event.name, data);
    if (!found) return { skipped: "unknownEvent" };
    const { anchor, key } = found;

    const plan = await step.run("plan", async () => {
      const db = getAdminDb();
      let applicationId = typeof data.applicationId === "string" ? data.applicationId : null;
      let interviewStart: Date | null = null;
      if (anchor === "passed") {
        const invitation = await loadInvitation(String(data.invitationId), orgId);
        // Only the first invitation follows a screening pass; later rounds are not "passed".
        if (!invitation || invitation.round > 1) return null;
        applicationId = invitation.applicationId;
      }
      if (typeof data.interviewId === "string") {
        const interview = await loadInterview(data.interviewId, orgId);
        if (!interview) return null;
        applicationId = interview.applicationId;
        interviewStart = interview.startsAt;
      }
      if (!applicationId) return null;
      const [app] = await db
        .select({ clientId: applications.clientId })
        .from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
      if (!app) return null;
      const templates = await db
        .select({ id: customMessages.id, timing: customMessages.timing })
        .from(customMessages)
        .where(
          and(
            eq(customMessages.orgId, orgId),
            eq(customMessages.anchor, anchor),
            eq(customMessages.enabled, true),
            or(isNull(customMessages.clientId), eq(customMessages.clientId, app.clientId)),
          ),
        );
      const anchorAt = new Date(event.ts ?? Date.now());
      const now = new Date();
      const sends = templates
        .map((t) => ({ id: t.id, at: timingAt(t.timing, anchorAt, interviewStart) }))
        // A time already gone (such as the day before an interview booked for tomorrow) is skipped.
        .filter(
          (s): s is { id: string; at: Date } =>
            s.at !== null && s.at.getTime() >= now.getTime() - 60_000,
        )
        .map((s) => ({ id: s.id, at: outsideQuietHours(s.at).toISOString() }))
        .sort((a, b) => a.at.localeCompare(b.at));
      return { applicationId, sends };
    });
    if (!plan || plan.sends.length === 0) return { sent: 0 };

    let sent = 0;
    for (const send of plan.sends) {
      await step.sleepUntil(`wait-${send.id}`, send.at);
      const outcome = await step.run(`send-${send.id}`, async () => {
        const [app] = await getAdminDb()
          .select({ outcome: applications.outcome })
          .from(applications)
          .where(eq(applications.id, plan.applicationId));
        const expected = anchor === "rejected" ? "rejected" : "active";
        if (app?.outcome !== expected) return "changed";
        if (typeof data.interviewId === "string") {
          const interview = await loadInterview(data.interviewId, orgId);
          const status =
            anchor === "interview_scheduled"
              ? "scheduled"
              : anchor === "interview_done"
                ? "done"
                : "no_show";
          if (interview?.status !== status) return "changed";
        }
        return sendCandidateMessage({
          applicationId: plan.applicationId,
          orgId,
          trigger: "custom",
          customMessageId: send.id,
          dedupeKey: `custom:${send.id}:${plan.applicationId}:${key}`,
          interviewId: typeof data.interviewId === "string" ? data.interviewId : undefined,
        });
      });
      if (outcome !== "changed") sent++;
    }
    return { sent };
  },
);

/** Emails a talent-pool suggestion with the job's entry link and a way to stop them (M5-6). */
export const poolSuggestionEmail = inngest.createFunction(
  { id: "pool-suggestion-email", triggers: [poolSuggested] },
  async ({ event, step }) => {
    const { suggestionId, orgId } = event.data;
    await step.sleepUntil("quiet-hours", outsideQuietHours(new Date(event.ts ?? Date.now())));
    return step.run("send", async () => {
      const db = getAdminDb();
      const [row] = await db
        .select({
          sourceApplicationId: poolSuggestions.sourceApplicationId,
          jobId: poolSuggestions.jobId,
          jobTitle: jobs.title,
          jobStatus: jobs.status,
          clientName: clients.name,
          clientId: poolSuggestions.clientId,
        })
        .from(poolSuggestions)
        .innerJoin(jobs, eq(jobs.id, poolSuggestions.jobId))
        .innerJoin(clients, eq(clients.id, poolSuggestions.clientId))
        .where(and(eq(poolSuggestions.id, suggestionId), eq(poolSuggestions.orgId, orgId)));
      if (!row || row.jobStatus !== "published") return "unavailable";
      const [entry] = await db
        .select({ code: entryUrls.code })
        .from(entryUrls)
        .where(
          and(
            eq(entryUrls.jobId, row.jobId),
            eq(entryUrls.channel, POOL_CHANNEL),
            eq(entryUrls.enabled, true),
          ),
        );
      if (!entry) return "noEntryUrl";
      return sendCandidateMessage({
        applicationId: row.sourceApplicationId,
        orgId,
        trigger: "pool_suggestion",
        dedupeKey: `pool:${suggestionId}`,
        overrides: {
          company: row.clientName,
          job: row.jobTitle,
          entry_url: `${getPublicEnv().appUrl}/a/${entry.code}`,
        },
      });
    });
  },
);
