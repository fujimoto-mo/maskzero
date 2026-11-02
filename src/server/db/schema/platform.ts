import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { candidates } from "./applications";
import { createdAt, id } from "./columns";
import { organizations, profiles } from "./tenancy";

export const dataRequestKind = pgEnum("data_request_kind", [
  "disclosure",
  "correction",
  "deletion",
]);
export const dataRequestStatus = pgEnum("data_request_status", ["open", "done", "rejected"]);

/** Candidates' APPI requests, handled from Settings → Data (docs/02 M13-2). */
export const dataRequests = pgTable("data_requests", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  /** Kept after a deletion so the request itself stays on record. */
  candidateName: text("candidate_name").notNull(),
  kind: dataRequestKind("kind").notNull(),
  status: dataRequestStatus("status").notNull().default("open"),
  note: text("note"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  handledBy: uuid("handled_by").references(() => profiles.id, { onDelete: "set null" }),
});

/** Marketing-site contact form. Not tenant data: only server code reads it (RLS, no policies). */
export const contactInquiries = pgTable("contact_inquiries", {
  id: id(),
  mode: text("mode").notNull(),
  company: text("company").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  category: text("category"),
  message: text("message"),
  consent: boolean("consent").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: createdAt(),
});

/** Fixed-window counters for public endpoints (server/rate-limit.ts). Server only. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
