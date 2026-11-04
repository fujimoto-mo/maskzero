import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  primaryKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applications, candidates } from "./applications";
import { jobs } from "./jobs";
import { createdAt, id, updatedAt } from "./columns";
import { clients, organizations, profiles } from "./tenancy";

// Automated email to candidates (docs/02 M9, docs/05 §10).

export const messageTrigger = pgEnum("message_trigger", [
  "pass",
  "follow_up",
  "confirmed",
  "reminder",
  "rejection",
  "next_round",
  // Phase 3 (M9-2)
  "remind_5d",
  "remind_3d",
  "interview_day",
  "thanks",
  "no_show",
  "cv_missing",
  "pool_suggestion",
  "custom",
  // Phase 5 (M12-2, M12-5)
  "ai_invite",
  "ai_remind",
]);
/** When a configurable email goes out, relative to what started it (docs/02 M9-3). */
export const messageTiming = pgEnum("message_timing", [
  "immediately",
  "same_day_18",
  "day_before_18",
  "next_day_10",
  "plus_3d_10",
  "plus_1w_10",
]);
/** What a custom email follows (M9-2). */
export const messageAnchor = pgEnum("message_anchor", [
  "applied",
  "passed",
  "interview_scheduled",
  "interview_done",
  "no_show",
  "rejected",
]);
export const messageStatus = pgEnum("message_status", [
  "scheduled",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "canceled",
  "dry_run",
]);

/** A company's wording for one trigger; without a row the shipped default is used (M9-3). */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Per-client override (P3); null = the company default. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    trigger: messageTrigger("trigger").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** null = the trigger's default timing (features/scheduling/templates.ts). */
    timing: messageTiming("timing"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("message_templates_org_trigger_key")
      .on(t.orgId, t.trigger)
      .where(sql`${t.clientId} is null`),
    uniqueIndex("message_templates_client_trigger_key")
      .on(t.clientId, t.trigger)
      .where(sql`${t.clientId} is not null`),
  ],
);

/** A company's own email: what it follows (anchor), when it goes out, and its wording (M9-2). */
export const customMessages = pgTable(
  "custom_messages",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null = every client of the company. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    anchor: messageAnchor("anchor").notNull(),
    timing: messageTiming("timing").notNull().default("immediately"),
    enabled: boolean("enabled").notNull().default(true),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("custom_messages_org_anchor_idx").on(t.orgId, t.anchor)],
);

/**
 * The send log (M9-5). dedupe_key makes every send idempotent: a retried job finds the row and
 * does not send twice. Rows go with their application in the retention purge.
 */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    trigger: messageTrigger("trigger").notNull(),
    customMessageId: uuid("custom_message_id").references(() => customMessages.id, {
      onDelete: "set null",
    }),
    toEmailEnc: text("to_email_enc"),
    subject: text("subject").notNull(),
    bodyRendered: text("body_rendered").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: messageStatus("status").notNull().default("scheduled"),
    providerMessageId: text("provider_message_id"),
    /** "resend" (mask0's sender) or "gmail" (the company's own account, M9-4). */
    sentVia: text("sent_via"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("messages_application_idx").on(t.applicationId, t.createdAt),
    index("messages_provider_idx").on(t.providerMessageId),
  ],
);

// -------------------------------------------------------------------------------------------------
// Inbound mail (docs/02 M3-10, M3-11): job-board notifications and candidate replies sent to the
// company's inbound address. Addresses, subjects and bodies are stored encrypted.
// -------------------------------------------------------------------------------------------------

export const inboundKind = pgEnum("inbound_kind", ["job_board", "candidate_reply", "other"]);

export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Known once the email is matched to a job or an application; rows without it are admin-only. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    kind: inboundKind("kind").notNull(),
    /** The job board, for notifications. */
    channel: text("channel"),
    /** sha256 of the normalized sender address, to match candidates. */
    fromHash: text("from_hash"),
    fromEnc: text("from_enc"),
    subjectEnc: text("subject_enc"),
    bodyEnc: text("body_enc"),
    /** Non-personal parse results: the matched job, or why parsing failed. */
    parsed: jsonb("parsed").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    readBy: uuid("read_by").references(() => profiles.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("inbound_emails_org_received_idx").on(t.orgId, t.receivedAt),
    index("inbound_emails_application_idx").on(t.applicationId),
  ],
);

export const entryWaitStatus = pgEnum("entry_wait_status", ["open", "entered", "dismissed"]);

/** Applied on a job board, not entered through the entry URL yet (M3-10, M3-11). */
export const entryWaits = pgTable(
  "entry_waits",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    applicantName: text("applicant_name").notNull(),
    inboundEmailId: uuid("inbound_email_id").references(() => inboundEmails.id, {
      onDelete: "set null",
    }),
    status: entryWaitStatus("status").notNull().default("open"),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("entry_waits_client_status_idx").on(t.orgId, t.clientId, t.status)],
);

// -------------------------------------------------------------------------------------------------
// Staff notifications by email (docs/02 M6-4) and the talent pool (M5-6)
// -------------------------------------------------------------------------------------------------

/** Which notifications a member also gets by email; in-app notifications are always on. */
export const notificationSettings = pgTable(
  "notification_settings",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    emailKinds: text("email_kinds")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

/** A job suggested to an opted-in candidate (M5-6); at most once per candidate and job. */
export const poolSuggestions = pgTable(
  "pool_suggestions",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The suggested job's client. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    /** The application whose consent allows the suggestion; the email is logged under it. */
    sourceApplicationId: uuid("source_application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    suggestedBy: uuid("suggested_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pool_suggestions_candidate_job_key").on(t.candidateId, t.jobId)],
);
