import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns";
import { entryUrls, jobs } from "./jobs";
import { clients, organizations, profiles } from "./tenancy";

export const applicationSource = pgEnum("application_source", ["entry", "csv", "manual", "test"]);
export const applicationStage = pgEnum("application_stage", [
  "applied",
  "screening",
  "booking",
  "scheduled",
  "interview",
  "evaluation",
  "offer",
  "hired",
]);
export const applicationOutcome = pgEnum("application_outcome", [
  "active",
  "rejected",
  "withdrawn",
  "hired",
]);
export const verdict = pgEnum("verdict", [
  "pending",
  "pass",
  "check",
  "fail_pending",
  "fail",
  "manual_pass",
  "manual_check",
  "manual_fail",
]);
export const waitingOn = pgEnum("waiting_on", ["candidate", "staff", "system"]);
export const documentKind = pgEnum("document_kind", ["resume", "cv", "other"]);
export const documentUploader = pgEnum("document_uploader", ["candidate", "staff"]);
export const documentStatus = pgEnum("document_status", ["uploading", "ready", "rejected"]);
export const readStatus = pgEnum("read_status", ["pending", "done", "failed", "skipped"]);
export const consentKind = pgEnum("consent_kind", [
  "privacy",
  "other_jobs",
  "recording",
  "ai_interview",
]);

/**
 * A person, once per org. Email and phone are stored encrypted (server/crypto/pii.ts) with keyed
 * hashes for lookup and dedupe.
 */
export const candidates = pgTable(
  "candidates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKana: text("name_kana"),
    emailEnc: text("email_enc"),
    emailHash: text("email_hash"),
    phoneEnc: text("phone_enc"),
    phoneHash: text("phone_hash"),
    prefecture: text("prefecture"),
    city: text("city"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("candidates_org_email_key").on(t.orgId, t.emailHash),
    index("candidates_org_phone_idx").on(t.orgId, t.phoneHash),
  ],
);

/** One candidate applying to one job: the unit that moves through the pipeline. */
export const applications = pgTable(
  "applications",
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
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    entryUrlId: uuid("entry_url_id").references(() => entryUrls.id, { onDelete: "set null" }),
    channel: text("channel"),
    source: applicationSource("source").notNull(),
    stage: applicationStage("stage").notNull().default("applied"),
    outcome: applicationOutcome("outcome").notNull().default("active"),
    currentRound: smallint("current_round").notNull().default(1),
    verdict: verdict("verdict").notNull().default("pending"),
    score: smallint("score"),
    waitingOn: waitingOn("waiting_on"),
    nextAction: text("next_action"),
    /** sha256 of the personal-page token (/p/{token}); the token itself is never stored. */
    portalTokenHash: text("portal_token_hash").unique(),
    /** The same token, encrypted (server/crypto/pii.ts), so emails and staff can link to it. */
    portalTokenEnc: text("portal_token_enc"),
    otherJobsOptIn: boolean("other_jobs_opt_in").notNull().default(false),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason"),
    /** When the retention job removes this application's documents and personal data. */
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_job_candidate_key").on(t.jobId, t.candidateId),
    index("applications_client_applied_idx").on(t.orgId, t.clientId, t.appliedAt),
    index("applications_job_verdict_idx").on(t.jobId, t.verdict),
    index("applications_purge_idx")
      .on(t.purgeAfter)
      .where(sql`${t.purgeAfter} is not null`),
  ],
);

/** Entry-page answers: pay_band, start_timing and criterion:{id} for form-sourced conditions. */
export const applicationAnswers = pgTable(
  "application_answers",
  {
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.key] })],
);

export const documents = pgTable(
  "documents",
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
    kind: documentKind("kind").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime"),
    bytes: integer("bytes"),
    pages: smallint("pages"),
    sha256: text("sha256"),
    uploadedBy: documentUploader("uploaded_by").notNull(),
    uploaderId: uuid("uploader_id").references(() => profiles.id, { onDelete: "set null" }),
    status: documentStatus("status").notNull().default("uploading"),
    readStatus: readStatus("read_status").notNull().default("pending"),
    readError: text("read_error"),
    /** Verbatim text of the document: the PDF text layer, or the AI transcription of a photo. */
    transcript: text("transcript"),
    textSource: text("text_source"),
    legibility: text("legibility"),
    /** The reading model or the text check found instructions aimed at an AI (docs/02 M4-5). */
    injectionSuspected: boolean("injection_suspected").notNull().default(false),
    profile: jsonb("profile"),
    readModel: text("read_model"),
    readPromptVersion: text("read_prompt_version"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("documents_application_idx").on(t.applicationId)],
);

export const consents = pgTable(
  "consents",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    kind: consentKind("kind").notNull(),
    granted: boolean("granted").notNull(),
    /** Identifies the exact consent text shown (features/intake/consent.ts). */
    textVersion: text("text_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("consents_application_idx").on(t.applicationId)],
);

export const csvImports = pgTable("csv_imports", {
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
  fileName: text("file_name").notNull(),
  channel: text("channel"),
  rowsTotal: integer("rows_total").notNull(),
  rowsCreated: integer("rows_created").notNull(),
  rowsDuplicate: integer("rows_duplicate").notNull(),
  rowsFailed: integer("rows_failed").notNull(),
  errors: jsonb("errors").notNull().default([]),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
