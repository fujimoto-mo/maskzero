import { eventType } from "inngest";
import { z } from "zod";

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
