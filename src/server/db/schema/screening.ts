import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { applications, verdict } from "./applications";
import { createdAt, id, updatedAt } from "./columns";
import { jobs } from "./jobs";
import { clients, organizations, profiles } from "./tenancy";

export const criterionType = pgEnum("criterion_type", ["basic", "specialist"]);
export const criterionKind = pgEnum("criterion_kind", ["choices", "dropdown", "range"]);
export const criterionSource = pgEnum("criterion_source", ["form", "resume"]);
export const weightMode = pgEnum("weight_mode", ["equal", "custom"]);
export const decisionSource = pgEnum("decision_source", ["ai", "staff", "confirm", "revert"]);

/** Per-job screening rules (docs/02 M4-4, M4-6). */
export const screeningSettings = pgTable(
  "screening_settings",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    passLine: smallint("pass_line").notNull().default(70),
    failLine: smallint("fail_line").notNull().default(40),
    autoJudge: boolean("auto_judge").notNull().default(true),
    confirmRejections: boolean("confirm_rejections").notNull().default(true),
    weightMode: weightMode("weight_mode").notNull().default("equal"),
    /** Bumped on every criteria change; runs record the version they used. */
    criteriaVersion: integer("criteria_version").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "screening_settings_lines",
      sql`${t.failLine} between 0 and 100 and ${t.passLine} between 1 and 100 and ${t.failLine} < ${t.passLine}`,
    ),
  ],
);

export const screeningCriteria = pgTable(
  "screening_criteria",
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
    type: criterionType("type").notNull(),
    label: text("label").notNull(),
    /** Basic conditions only. */
    kind: criterionKind("kind"),
    source: criterionSource("source"),
    /** choices {options, pass, multi} · dropdown {options, line, dir} · range {min, max, unit}. */
    config: jsonb("config").notNull().default({}),
    required: boolean("required").notNull().default(false),
    /** Points out of 100 in custom weight mode. */
    weight: smallint("weight").notNull().default(0),
    /** Age conditions: the exception reason from 労働施策総合推進法施行規則 1条の3. */
    legalException: text("legal_exception"),
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("screening_criteria_job_idx").on(t.jobId, t.position)],
);

export const screeningRuns = pgTable(
  "screening_runs",
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
    criteriaVersion: integer("criteria_version").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    score: smallint("score"),
    verdictAi: verdict("verdict_ai").notNull(),
    /** Per criterion: value / met / match, evidence, evidence_verified. */
    results: jsonb("results").notNull().default([]),
    /** injection, unverified_evidence, low_legibility, refusal, invalid_output, no_ai, … */
    flags: jsonb("flags").notNull().default({}),
    /** Why the verdict is what it is: Screening.reasons.* codes from decide(). */
    reasons: jsonb("reasons").notNull().default([]),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    createdAt: createdAt(),
  },
  (t) => [index("screening_runs_application_idx").on(t.applicationId, t.createdAt)],
);

/** Every verdict change, AI or human, in order (docs/02 M4-7). */
export const screeningDecisions = pgTable(
  "screening_decisions",
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
    verdict: verdict("verdict").notNull(),
    source: decisionSource("source").notNull(),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("screening_decisions_application_idx").on(t.applicationId, t.createdAt)],
);

/** Token and cost metering per org (docs/02 M13-4). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_org_idx").on(t.orgId, t.createdAt)],
);
