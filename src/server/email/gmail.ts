import "server-only";
import { and, eq } from "drizzle-orm";
import { getAdminDb } from "@/server/db/admin";
import { integrations } from "@/server/db/schema";
import { integrationsFake } from "@/server/integrations/config";
import { IntegrationError } from "@/server/integrations/oauth";
import { sendGmail } from "@/server/integrations/providers";
import { buildMime } from "./mime";
import type { OutgoingEmail, SendResult } from "./send";

/**
 * Sends from the company's connected Gmail account (docs/02 M9-4). Throws IntegrationError when
 * the account is missing, revoked or lacks the Gmail grant; the caller falls back to mask0's sender.
 */
export async function sendViaGmail(orgId: string, email: OutgoingEmail): Promise<SendResult> {
  const [row] = await getAdminDb()
    .select({ accountEmail: integrations.accountEmail })
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, "google")));
  if (!row) throw new IntegrationError("not_connected");
  if (/\.invalid$/i.test(email.to.trim())) return { id: null, dryRun: true };
  const mime = buildMime({
    from: { name: email.fromName, address: row.accountEmail },
    to: email.to,
    replyTo: email.replyTo,
    subject: email.subject,
    text: email.text,
    attachments: email.attachments,
  });
  const id = await sendGmail(orgId, mime);
  return { id, dryRun: integrationsFake() };
}
