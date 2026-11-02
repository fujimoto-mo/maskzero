import "server-only";
import { Resend } from "resend";

export type OutgoingEmail = { to: string; subject: string; text: string };

export type SendResult = { id: string | null; dryRun: boolean };

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
    from,
    to: email.to,
    subject: email.subject,
    text: email.text,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id ?? null, dryRun: false };
}
