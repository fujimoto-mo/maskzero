import {
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
import { interviews } from "./scheduling";
import { clients, organizations, profiles } from "./tenancy";

// The interview workspace (docs/02 M11): prep questions, the interviewers' evaluations, the
// transcript, the AI report and the decision. Everything hangs off an application and goes with
// it in the retention purge (FK cascade).

const scope = () => ({
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
});

export type PrepQuestion = {
  id: string;
  group: "experience" | "consistency" | "motivation" | "own";
  text: string;
  /** Why to ask it: what in the documents or the round's purpose prompted it. */
  why: string;
  picked: boolean;
};

export const questionMode = pgEnum("question_mode", ["standard", "deep"]);

/** Questions for one interview: AI suggestions and the interviewer's own, picked and ordered. */
export const interviewQuestions = pgTable("interview_questions", {
  interviewId: uuid("interview_id")
    .primaryKey()
    .references(() => interviews.id, { onDelete: "cascade" }),
  ...scope(),
  mode: questionMode("mode").notNull().default("standard"),
  items: jsonb("items").$type<PrepQuestion[]>().notNull().default([]),
  model: text("model"),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recommendation = pgEnum("interview_recommendation", ["advance", "hold", "decline"]);

/** One interviewer's notes and ratings for one interview (M11-3). */
export const interviewEvaluations = pgTable(
  "interview_evaluations",
  {
    id: id(),
    ...scope(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Rubric criterion id → 1–5 (features/interviews/rubric.ts). */
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    comments: jsonb("comments").$type<Record<string, string>>().notNull().default({}),
    notes: text("notes"),
    recommendation: recommendation("recommendation"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("interview_evaluations_author_key").on(t.interviewId, t.authorId)],
);

export type TranscriptSegment = { t: number | null; speaker: string | null; text: string };

/** The interview's transcript, uploaded by staff for now (M11-5). Stored encrypted. */
export const interviewTranscripts = pgTable("interview_transcripts", {
  interviewId: uuid("interview_id")
    .primaryKey()
    .references(() => interviews.id, { onDelete: "cascade" }),
  ...scope(),
  /** JSON of TranscriptSegment[], encrypted (server/crypto/pii.ts). */
  segmentsEnc: text("segments_enc").notNull(),
  segmentCount: smallint("segment_count").notNull(),
  source: text("source").notNull().default("upload"),
  uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ReportScore = {
  criterionId: string;
  score: number;
  comment: string;
  evidence: { t: number | null; quote: string; verified: boolean }[];
};

export const reportStatus = pgEnum("interview_report_status", ["pending", "ready", "failed"]);

/** The AI's evaluation from the transcript, shown next to the people's own (M11-6). */
export const interviewReports = pgTable(
  "interview_reports",
  {
    id: id(),
    ...scope(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    status: reportStatus("status").notNull().default("pending"),
    scores: jsonb("scores").$type<ReportScore[]>().notNull().default([]),
    total: numeric("total", { precision: 4, scale: 2 }),
    summary: text("summary"),
    needs: jsonb("needs").$type<string[]>().notNull().default([]),
    model: text("model"),
    promptVersion: text("prompt_version"),
    error: text("error"),
    requestedBy: uuid("requested_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("interview_reports_interview_key").on(t.interviewId)],
);

export const interviewDecision = pgEnum("interview_decision", [
  "pass",
  "next_round",
  "fail",
  "withdrawn",
]);

/**
 * A decision after an interview (M11-4). The application changes at once; emails wait until
 * `effectiveAt`, and until then the decision can be undone.
 */
export const interviewDecisions = pgTable(
  "interview_decisions",
  {
    id: id(),
    ...scope(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    decision: interviewDecision("decision").notNull(),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    /** The application's state before, to restore on undo. */
    previous: jsonb("previous").notNull(),
    /** The invitation a "next round" created, canceled on undo. */
    invitationId: uuid("invitation_id"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("interview_decisions_interview_idx").on(t.interviewId, t.createdAt)],
);
