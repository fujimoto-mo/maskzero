import { eventType } from "inngest";
import { z } from "zod";

// Event payloads carry IDs only: Inngest stores them, and personal data stays in our database.

export const orgCreated = eventType("org/created", {
  schema: z.object({ orgId: z.uuid(), userId: z.uuid() }),
});
