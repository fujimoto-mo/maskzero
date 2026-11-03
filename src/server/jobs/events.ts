import { eventType } from "inngest";
import { z } from "zod";
import { EVENT_NOTIFICATION_KINDS } from "@/features/notifications/kinds";

// Event payloads carry IDs only: Inngest stores them, and personal data stays in our database.

export const orgCreated = eventType("org/created", {
  schema: z.object({ orgId: z.uuid(), userId: z.uuid() }),
});

/** A candidate finished an entry or uploaded documents: verify, read and screen the application. */
export const applicationSubmitted = eventType("application/submitted", {
  schema: z.object({ applicationId: z.uuid(), orgId: z.uuid() }),
});

/** Re-screen one application (criteria changed, or staff asked); `reread` also re-reads its documents. */
export const applicationRescreen = eventType("application/rescreen", {
  schema: z.object({ applicationId: z.uuid(), orgId: z.uuid(), reread: z.boolean().optional() }),
});

/** A job's screening conditions changed: re-screen its open applications (docs/02 M4-8). */
export const criteriaChanged = eventType("job/criteria-changed", {
  schema: z.object({ jobId: z.uuid(), orgId: z.uuid() }),
});

/** Runs the retention purge now (operations, tests); it also runs nightly. */
export const retentionPurgeRequested = eventType("retention/purge-requested", {
  schema: z.object({}),
});

/** An interview invitation was created: email it, then follow up while it isn't booked (docs/02 M7). */
export const invitationCreated = eventType("invitation/created", {
  schema: z.object({ invitationId: z.uuid(), orgId: z.uuid() }),
});

/** Staff asked to email the invitation again. `requestedAt` keeps each resend distinct. */
export const invitationResend = eventType("invitation/resend", {
  schema: z.object({ invitationId: z.uuid(), orgId: z.uuid(), requestedAt: z.string() }),
});

/** An interview was booked: confirmation with .ics now, the day-before reminder later. */
export const interviewScheduled = eventType("interview/scheduled", {
  schema: z.object({ interviewId: z.uuid(), orgId: z.uuid() }),
});

/** An interview moved or was canceled: cancels its pending reminder (cancelOn). */
export const interviewChanged = eventType("interview/changed", {
  schema: z.object({ interviewId: z.uuid(), orgId: z.uuid() }),
});

/** A person confirmed a rejection: the notice goes out the next morning (docs/02 M9-1). */
export const applicationRejected = eventType("application/rejected", {
  schema: z.object({ applicationId: z.uuid(), orgId: z.uuid() }),
});

/** Staff marked an interview done or no-show: a thank-you or a re-booking request follows (M9-2). */
export const interviewFinished = eventType("interview/finished", {
  schema: z.object({
    interviewId: z.uuid(),
    orgId: z.uuid(),
    outcome: z.enum(["done", "no_show"]),
  }),
});

/** A job was suggested to a talent-pool candidate: email the suggestion (docs/02 M5-6). */
export const poolSuggested = eventType("pool/suggested", {
  schema: z.object({ suggestionId: z.uuid(), orgId: z.uuid() }),
});

/** Something members may also want by email (docs/02 M6-4). */
export const staffNotify = eventType("staff/notify", {
  schema: z.object({
    orgId: z.uuid(),
    applicationId: z.uuid(),
    kind: z.enum(EVENT_NOTIFICATION_KINDS),
  }),
});
