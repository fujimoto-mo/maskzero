import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
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
    toEmailEnc: text("to_email_enc"),
    subject: text("subject").notNull(),
    bodyRendered: text("body_rendered").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: messageStatus("status").notNull().default("scheduled"),
    providerMessageId: text("provider_message_id"),
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
