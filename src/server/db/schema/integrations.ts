import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { createdAt, id, updatedAt } from "./columns";
import { interviews } from "./scheduling";
import { clients, organizations, profiles } from "./tenancy";

// Connected accounts (docs/02 M8-6, M9-4) and what the meeting bot hears (M11-5, M11-7).

export const integrationProvider = pgEnum("integration_provider", ["google", "zoom", "microsoft"]);
export const integrationStatus = pgEnum("integration_status", ["active", "error"]);

/**
 * One connected account per provider and company: Google (Calendar, Meet, Gmail), Zoom or
 * Microsoft (Teams). The tokens are encrypted, and only server code reads them.
 */
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    accountEmail: text("account_email").notNull(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** JSON of OAuthTokens (server/integrations/oauth.ts), encrypted. No grant for app users. */
    tokensEnc: text("tokens_enc").notNull(),
    status: integrationStatus("status").notNull().default("active"),
    /** Why the connection stopped working (a code, such as "revoked"). */
    error: text("error"),
    connectedBy: uuid("connected_by").references(() => profiles.id, { onDelete: "set null" }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_org_provider_key").on(t.orgId, t.provider)],
);

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

/** One utterance the meeting bot transcribed during the interview (M11-5). Stored encrypted. */
export const interviewLiveSegments = pgTable(
  "interview_live_segments",
  {
    id: id(),
    ...scope(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    /** Seconds since the recording started. */
    at: real("at"),
    speakerEnc: text("speaker_enc"),
    textEnc: text("text_enc").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("interview_live_segments_interview_idx").on(t.interviewId, t.id)],
);

/** The AI's latest suggestions while the interview runs (M11-7). */
export const interviewAssists = pgTable("interview_assists", {
  interviewId: uuid("interview_id")
    .primaryKey()
    .references(() => interviews.id, { onDelete: "cascade" }),
  ...scope(),
  /** JSON of AssistSuggestion[] (features/interviews/live.ts), encrypted: they quote the candidate. */
  suggestionsEnc: text("suggestions_enc").notNull(),
  /** How many segments the suggestions were drawn from. */
  segmentCount: integer("segment_count").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
