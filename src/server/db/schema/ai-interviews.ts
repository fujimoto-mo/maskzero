import {
  boolean,
  index,
  jsonb,
  numeric,
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
import { jobs } from "./jobs";
import { clients, organizations, profiles } from "./tenancy";

// The AI interviewer (docs/02 M12), behind the "ai_interviewer" feature flag on organizations.
// People review and decide every outcome; an AI score never rejects anyone on its own.

export type AiQuestion = {
  id: string;
  text: string;
  /** What a strong answer shows; the AI scores against it. */
  rubric: string;
  /** How many follow-up questions the AI may ask (0–2). */
  followUps: number;
};

/** Per job: whether round 1 is an AI interview, and its questions (M12-1). */
export const aiInterviewConfigs = pgTable("ai_interview_configs", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  questions: jsonb("questions").$type<AiQuestion[]>().notNull().default([]),
  timeLimitMinutes: smallint("time_limit_minutes").notNull().default(30),
  deadlineDays: smallint("deadline_days").notNull().default(7),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiSessionStatus = pgEnum("ai_session_status", [
  "invited",
  "started",
  "completed",
  "scored",
  "aborted",
  "expired",
]);

export type AiQuestionScore = {
  questionId: string;
  score: number;
  comment: string;
  evidence: { quote: string; verified: boolean }[];
};

export type AiSessionFlags = {
  /** The answers tried to instruct the AI. */
  injection?: boolean;
  /** Time ran out before every question was answered. */
  partial?: boolean;
  /** The candidate asked for an interview with a person instead. */
  humanRequested?: boolean;
  /** Scoring failed; a person reads the answers. */
  scoringFailed?: boolean;
};

/** One candidate's AI interview (M12-2, M12-3). The conversation is stored encrypted. */
export const aiInterviewSessions = pgTable(
  "ai_interview_sessions",
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
    status: aiSessionStatus("status").notNull().default("invited"),
    /** The questions as configured when the candidate was invited. */
    questions: jsonb("questions").$type<AiQuestion[]>().notNull(),
    timeLimitMinutes: smallint("time_limit_minutes").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** JSON of the turns, encrypted (server/crypto/pii.ts). */
    transcriptEnc: text("transcript_enc"),
    turnCount: smallint("turn_count").notNull().default(0),
    /** Index of the question being asked, and follow-ups used on it. */
    currentQuestion: smallint("current_question").notNull().default(0),
    followUpsUsed: smallint("follow_ups_used").notNull().default(0),
    scores: jsonb("scores").$type<AiQuestionScore[]>().notNull().default([]),
    total: numeric("total", { precision: 4, scale: 2 }),
    band: text("band"),
    summary: text("summary"),
    flags: jsonb("flags").$type<AiSessionFlags>().notNull().default({}),
    model: text("model"),
    rubricVersion: text("rubric_version"),
    attempt: smallint("attempt").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_interview_sessions_application_idx").on(t.applicationId, t.createdAt)],
);

/** A recruiter's blind rating of an AI interview, to measure agreement with the AI (P5 exit). */
export const aiInterviewReviews = pgTable(
  "ai_interview_reviews",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiInterviewSessions.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    band: text("band").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ai_interview_reviews_reviewer_key").on(t.sessionId, t.reviewerId)],
);
