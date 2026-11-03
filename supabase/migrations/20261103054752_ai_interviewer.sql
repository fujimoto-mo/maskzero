CREATE TYPE "public"."ai_session_status" AS ENUM('invited', 'started', 'completed', 'scored', 'aborted', 'expired');--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'ai_invite';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'ai_remind';--> statement-breakpoint
CREATE TABLE "ai_interview_configs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_limit_minutes" smallint DEFAULT 30 NOT NULL,
	"deadline_days" smallint DEFAULT 7 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_interview_reviews" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"band" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "ai_session_status" DEFAULT 'invited' NOT NULL,
	"questions" jsonb NOT NULL,
	"time_limit_minutes" smallint NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"transcript_enc" text,
	"turn_count" smallint DEFAULT 0 NOT NULL,
	"current_question" smallint DEFAULT 0 NOT NULL,
	"follow_ups_used" smallint DEFAULT 0 NOT NULL,
	"scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric(4, 2),
	"band" text,
	"summary" text,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"rubric_version" text,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "feature_flags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_interview_configs" ADD CONSTRAINT "ai_interview_configs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_configs" ADD CONSTRAINT "ai_interview_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_configs" ADD CONSTRAINT "ai_interview_configs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_configs" ADD CONSTRAINT "ai_interview_configs_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_reviews" ADD CONSTRAINT "ai_interview_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_reviews" ADD CONSTRAINT "ai_interview_reviews_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_reviews" ADD CONSTRAINT "ai_interview_reviews_session_id_ai_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_reviews" ADD CONSTRAINT "ai_interview_reviews_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_sessions" ADD CONSTRAINT "ai_interview_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_sessions" ADD CONSTRAINT "ai_interview_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interview_sessions" ADD CONSTRAINT "ai_interview_sessions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interview_reviews_reviewer_key" ON "ai_interview_reviews" USING btree ("session_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "ai_interview_sessions_application_idx" ON "ai_interview_sessions" USING btree ("application_id","created_at");