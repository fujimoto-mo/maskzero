import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { createdAt, id, updatedAt } from "./columns";
import { clients, organizations } from "./tenancy";

// Interview invitations, availability and booking (docs/04 "Invitations, scheduling and interviews",
// docs/02 M7, M8). Times are timestamptz; slot math happens in Japan time (features/scheduling).

export const confirmMode = pgEnum("confirm_mode", ["auto", "manual"]);
export const interviewTool = pgEnum("interview_tool", ["url", "onsite", "meet", "zoom", "teams"]);
export const invitationStatus = pgEnum("invitation_status", [
  "sent",
  "opened",
  "booked",
  "expired",
  "canceled",
]);
export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "unmatched",
  "canceled",
]);
export const interviewStatus = pgEnum("interview_status", [
  "scheduled",
  "done",
  "no_show",
  "canceled",
]);

/** A bookable calendar: in P2 one shared pool per client (owner_member_id null). */
export const calendars = pgTable(
  "calendars",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Set for an interviewer's own calendar (P3); null = the client's shared pool. */
    ownerUserId: uuid("owner_user_id"),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Asia/Tokyo"),
    googleCalendarId: text("google_calendar_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("calendars_client_pool_key")
      .on(t.clientId)
      .where(sql`${t.ownerUserId} is null`),
  ],
);

export type WeeklyHours = Partial<
  Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { on: boolean; from: string; to: string }>
>;

/** Availability rules of one calendar (docs/02 M8-1, M8-6, M8-7). */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    calendarId: uuid("calendar_id")
      .primaryKey()
      .references(() => calendars.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Per-weekday hours keyed "0" (Sunday) … "6"; days without an entry use the common hours. */
    weekly: jsonb("weekly").$type<WeeklyHours>().notNull().default({}),
    commonFrom: text("common_from").notNull().default("10:00"),
    commonTo: text("common_to").notNull().default("18:00"),
    slotMinutes: smallint("slot_minutes").notNull().default(60),
    /** Length of second and later rounds. */
    laterRoundMinutes: smallint("later_round_minutes").notNull().default(90),
    bufferMinutes: smallint("buffer_minutes").notNull().default(0),
    excludeWeekends: boolean("exclude_weekends").notNull().default(true),
    excludeHolidays: boolean("exclude_holidays").notNull().default(true),
    windowDays: smallint("window_days").notNull().default(42),
    minNoticeHours: smallint("min_notice_hours").notNull().default(24),
    /** Candidates may reschedule or cancel until this many hours before the start (M8-5). */
    cancelCutoffHours: smallint("cancel_cutoff_hours").notNull().default(24),
    confirmMode: confirmMode("confirm_mode").notNull().default("auto"),
    tool: interviewTool("tool").notNull().default("url"),
    fixedMeetingUrl: text("fixed_meeting_url"),
    onsiteAddress: text("onsite_address"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "availability_rules_ranges",
      sql`${t.slotMinutes} between 15 and 240
      and ${t.laterRoundMinutes} between 15 and 240 and ${t.bufferMinutes} between 0 and 120
      and ${t.windowDays} between 1 and 180 and ${t.minNoticeHours} between 0 and 336
      and ${t.cancelCutoffHours} between 0 and 336`,
    ),
  ],
);

/** One slot opened or closed by hand on the month calendar (M8-2). */
export const slotOverrides = pgTable(
  "slot_overrides",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    open: boolean("open").notNull(),
  },
  (t) => [uniqueIndex("slot_overrides_calendar_start_key").on(t.calendarId, t.startsAt)],
);

/** "Concerns" candidates can tick on the booking page, with the company's prepared answer (M8-3). */
export const concernOptions = pgTable("concern_options", {
  id: id(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  answer: text("answer").notNull(),
  position: smallint("position").notNull().default(0),
  createdAt: createdAt(),
});

/** One invitation to book round N of the interviews (M7-1). */
export const interviewInvitations = pgTable(
  "interview_invitations",
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
    round: smallint("round").notNull().default(1),
    status: invitationStatus("status").notNull().default("sent"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    followupCount: smallint("followup_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("interview_invitations_application_round_key").on(t.applicationId, t.round)],
);

export type PreferredSlot = { startsAt: string; endsAt: string };

/** The candidate's answer on the booking page: up to three preferred slots (M8-3, M8-4). */
export const bookingRequests = pgTable(
  "booking_requests",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => interviewInvitations.id, { onDelete: "cascade" }),
    preferred: jsonb("preferred").$type<PreferredSlot[]>().notNull(),
    concernIds: uuid("concern_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    memo: text("memo"),
    status: bookingStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("booking_requests_invitation_idx").on(t.invitationId)],
);

/**
 * A scheduled interview. The interviews_no_overlap exclusion constraint (custom migration) makes a
 * double booking of one calendar impossible, even for concurrent confirmations.
 */
export const interviews = pgTable(
  "interviews",
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
    invitationId: uuid("invitation_id").references(() => interviewInvitations.id, {
      onDelete: "set null",
    }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    round: smallint("round").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    tool: interviewTool("tool").notNull(),
    meetingUrl: text("meeting_url"),
    location: text("location"),
    externalEventId: text("external_event_id"),
    status: interviewStatus("status").notNull().default("scheduled"),
    /** Members who run this interview (docs/02 M1-4): interviewers see only their own. */
    interviewerIds: uuid("interviewer_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** What this round should find out (docs/02 M11-2). */
    purpose: text("purpose"),
    /** False when the candidate declined recording (docs/02 M11-5). */
    recordingAllowed: boolean("recording_allowed").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("interviews_calendar_start_idx").on(t.calendarId, t.startsAt),
    index("interviews_application_idx").on(t.applicationId),
    check("interviews_time_order", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
