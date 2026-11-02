import "server-only";
import { Resend } from "resend";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  /** Display name for the sender, such as "{client} 採用担当" (docs/05 §10). */
  fromName?: string;
  replyTo?: string | null;
  attachments?: { filename: string; content: string; contentType: string }[];
};

export type SendResult = { id: string | null; dryRun: boolean };

/** "Name <address>" with the address taken from EMAIL_FROM (which may carry its own name). */
function sender(from: string, name: string | undefined): string {
  if (!name) return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return `"${name.replace(/["\\]/g, "")}" <${address}>`;
}

/**
 * Sends through Resend. Without RESEND_API_KEY and EMAIL_FROM it logs a dry run instead, so local
 * development and previews never email real people by accident.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    // Log the subject only: recipients are personal data.
    console.info("[email] dry run:", email.subject);
    return { id: null, dryRun: true };
  }

  const { data, error } = await new Resend(apiKey).emails.send({
    from: sender(from, email.fromName),
    to: email.to,
    subject: email.subject,
    text: email.text,
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    ...(email.attachments ? { attachments: email.attachments } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id ?? null, dryRun: false };
}
