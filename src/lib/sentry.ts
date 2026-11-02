import type { ErrorEvent } from "@sentry/nextjs";

const EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;
// Japanese numbers (090-1234-5678, 0312345678, +81 3-1234-5678) standing alone, so the digit runs
// inside UUIDs and other IDs are left intact.
const PHONE = /(?<![\w-])(?:\+81[-\s]?\d{1,4}|0\d{1,4})[-\s]?\d{1,4}[-\s]?\d{3,4}(?![\w-])/g;

function scrub(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrub(inner)]));
  }
  return value;
}

/**
 * Masks email addresses and phone numbers anywhere in an event before it leaves the app, since
 * candidate data must never reach logs or error trackers (docs/05 §11).
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return scrub(event) as ErrorEvent;
}

/** Shared by the server (src/instrumentation.ts) and the browser (src/instrumentation-client.ts). */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
  };
}
