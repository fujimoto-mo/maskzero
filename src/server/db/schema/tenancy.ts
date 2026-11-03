import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { createdAt, id, updatedAt } from "./columns";

export const orgKind = pgEnum("org_kind", ["agency", "inhouse"]);
export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "recruiter",
  "interviewer",
  "viewer",
]);
export const memberStatus = pgEnum("member_status", ["active", "invited", "disabled"]);

/** The paying tenant: a recruitment agency or a company hiring for itself (docs/04 §2). */
export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: orgKind("kind").notNull().default("inhouse"),
    plan: text("plan").notNull().default("trial"),
    senderName: text("sender_name"),
    replyTo: text("reply_to"),
    entryMsgTemplate: text("entry_msg_template"),
    /** Paste text for applicants who applied on a board but have not entered (M3-11). */
    nudgeMsgTemplate: text("nudge_msg_template"),
    docRetentionDays: integer("doc_retention_days").notNull().default(180),
    inboundLocalPart: text("inbound_local_part").unique(),
    testMode: boolean("test_mode").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("organizations_retention_range", sql`${t.docRetentionDays} between 30 and 730`),
    check("organizations_name_length", sql`char_length(${t.name}) between 1 and 100`),
  ],
);

/** One row per auth user, created by the private.handle_new_user() trigger. */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("ja"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** Notifications newer than this show as unread. */
  notificationsSeenAt: timestamp("notifications_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A company the org hires for. In-house orgs have exactly one, the default client. */
export const clients = pgTable(
  "clients",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    logoPath: text("logo_path"),
    senderNameOverride: text("sender_name_override"),
    settings: jsonb("settings").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("clients_org_slug_key").on(t.orgId, t.slug),
    uniqueIndex("clients_one_default_per_org")
      .on(t.orgId)
      .where(sql`${t.isDefault}`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    /** null = every client of the org; otherwise only these clients. */
    clientIds: uuid("client_ids").array(),
    status: memberStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").notNull(),
    clientIds: uuid("client_ids").array(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);
