import "server-only";
import * as Sentry from "@sentry/nextjs";
import { inngest } from "./client";

type OutgoingEvent = Parameters<typeof inngest.send>[0];

/**
 * Sends an event without failing the caller's request when Inngest is unreachable; the failure goes
 * to Sentry. Use it only where losing the event is acceptable (such as a welcome email). Work that
 * must happen needs a durable outbox instead.
 */
export async function sendEventBestEffort(event: OutgoingEvent): Promise<void> {
  try {
    await inngest.send(event);
  } catch (error) {
    Sentry.captureException(error);
    console.error("[inngest] event not sent", error);
  }
}
