import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";
import { clients, organizations, profiles } from "./tenancy";

export const eventActor = pgEnum("event_actor", ["candidate", "system", "staff"]);

/**
 * Append-only timeline and analytics source (docs/04 §5). Written only through recordEvent();
 * UPDATE and DELETE are revoked for app users.
 */
export const events = pgTable(
  "events",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    // Foreign key to applications is added in Phase 1, when that table exists.
    applicationId: uuid("application_id"),
    actor: eventActor("actor").notNull(),
    actorId: uuid("actor_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_application_idx").on(t.applicationId, t.occurredAt),
    index("events_org_type_idx").on(t.orgId, t.type, t.occurredAt),
  ],
);

/** Who did what, for security review (docs/02 M13-1). Append-only like events. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    meta: jsonb("meta").notNull().default({}),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_org_idx").on(t.orgId, t.createdAt)],
);
