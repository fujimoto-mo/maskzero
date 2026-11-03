// Notifications staff can also receive by email (docs/02 M6-4). Codes only: they travel in
// Inngest events and preference rows.

export const EMAIL_NOTIFICATION_KINDS = [
  "new_application",
  "needs_review",
  "booking_request",
  "interview_confirmed",
  "candidate_reply",
  "tomorrow_digest",
] as const;
export type EmailNotificationKind = (typeof EMAIL_NOTIFICATION_KINDS)[number];

/** Kinds sent one by one as they happen; the digest goes out daily instead. */
export const EVENT_NOTIFICATION_KINDS = [
  "new_application",
  "needs_review",
  "booking_request",
  "interview_confirmed",
  "candidate_reply",
] as const satisfies readonly EmailNotificationKind[];
