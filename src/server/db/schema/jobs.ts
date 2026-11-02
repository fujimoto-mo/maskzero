import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns";
import { clients, organizations, profiles } from "./tenancy";

export const jobStatus = pgEnum("job_status", ["draft", "published", "stopped", "archived"]);

/** A job posting (求人原稿). Field values live in posting_fields, validated by features/jobs/schema.ts. */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("draft"),
    /** Copy of posting_fields.title for lists and search. */
    title: text("title").notNull().default(""),
    postingFields: jsonb("posting_fields").notNull().default({}),
    postingFrom: date("posting_from"),
    /** null = no end date. */
    postingTo: date("posting_to"),
    requiresCv: boolean("requires_cv").notNull().default(false),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_client_status_idx").on(t.orgId, t.clientId, t.status)],
);

export const jobImages = pgTable(
  "job_images",
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
    /** 1–6; slot 1 is the main image. */
    slot: smallint("slot").notNull(),
    storagePath: text("storage_path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    caption: text("caption"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("job_images_job_slot_key").on(t.jobId, t.slot),
    check("job_images_slot_range", sql`${t.slot} between 1 and 6`),
    check("job_images_caption_length", sql`char_length(${t.caption}) <= 70`),
  ],
);

/** One public entry link per job × job board; pasted into the board's auto-reply (docs/02 M3-1). */
export const entryUrls = pgTable(
  "entry_urls",
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
    /** A board from features/intake/channels.ts, or a custom name. */
    channel: text("channel").notNull(),
    code: text("code").notNull().unique(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entry_urls_job_channel_key").on(t.jobId, t.channel)],
);
