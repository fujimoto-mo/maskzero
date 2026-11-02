CREATE TYPE "public"."job_status" AS ENUM('draft', 'published', 'stopped', 'archived');--> statement-breakpoint
CREATE TYPE "public"."application_outcome" AS ENUM('active', 'rejected', 'withdrawn', 'hired');--> statement-breakpoint
CREATE TYPE "public"."application_source" AS ENUM('entry', 'csv', 'manual', 'test');--> statement-breakpoint
CREATE TYPE "public"."application_stage" AS ENUM('applied', 'screening', 'booking', 'scheduled', 'interview', 'evaluation', 'offer', 'hired');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('privacy', 'other_jobs', 'recording', 'ai_interview');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('resume', 'cv', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploading', 'ready', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."document_uploader" AS ENUM('candidate', 'staff');--> statement-breakpoint
CREATE TYPE "public"."read_status" AS ENUM('pending', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('pending', 'pass', 'check', 'fail_pending', 'fail', 'manual_pass', 'manual_check', 'manual_fail');--> statement-breakpoint
CREATE TYPE "public"."waiting_on" AS ENUM('candidate', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."criterion_kind" AS ENUM('choices', 'dropdown', 'range');--> statement-breakpoint
CREATE TYPE "public"."criterion_source" AS ENUM('form', 'resume');--> statement-breakpoint
CREATE TYPE "public"."criterion_type" AS ENUM('basic', 'specialist');--> statement-breakpoint
CREATE TYPE "public"."decision_source" AS ENUM('ai', 'staff', 'confirm', 'revert');--> statement-breakpoint
CREATE TYPE "public"."weight_mode" AS ENUM('equal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."data_request_kind" AS ENUM('disclosure', 'correction', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('open', 'done', 'rejected');--> statement-breakpoint
CREATE TABLE "entry_urls" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_urls_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "job_images" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_images_slot_range" CHECK ("job_images"."slot" between 1 and 6),
	CONSTRAINT "job_images_caption_length" CHECK (char_length("job_images"."caption") <= 70)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"posting_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"posting_from" date,
	"posting_to" date,
	"requires_cv" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_answers" (
	"application_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "application_answers_application_id_key_pk" PRIMARY KEY("application_id","key")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"entry_url_id" uuid,
	"channel" text,
	"source" "application_source" NOT NULL,
	"stage" "application_stage" DEFAULT 'applied' NOT NULL,
	"outcome" "application_outcome" DEFAULT 'active' NOT NULL,
	"current_round" smallint DEFAULT 1 NOT NULL,
	"verdict" "verdict" DEFAULT 'pending' NOT NULL,
	"score" smallint,
	"waiting_on" "waiting_on",
	"next_action" text,
	"portal_token_hash" text,
	"other_jobs_opt_in" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_portal_token_hash_unique" UNIQUE("portal_token_hash")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_kana" text,
	"email_enc" text,
	"email_hash" text,
	"phone_enc" text,
	"phone_hash" text,
	"prefecture" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"kind" "consent_kind" NOT NULL,
	"granted" boolean NOT NULL,
	"text_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_imports" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"channel" text,
	"rows_total" integer NOT NULL,
	"rows_created" integer NOT NULL,
	"rows_duplicate" integer NOT NULL,
	"rows_failed" integer NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text,
	"bytes" integer,
	"pages" smallint,
	"sha256" text,
	"uploaded_by" "document_uploader" NOT NULL,
	"uploader_id" uuid,
	"status" "document_status" DEFAULT 'uploading' NOT NULL,
	"read_status" "read_status" DEFAULT 'pending' NOT NULL,
	"read_error" text,
	"transcript" text,
	"text_source" text,
	"legibility" text,
	"profile" jsonb,
	"read_model" text,
	"read_prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_criteria" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "criterion_type" NOT NULL,
	"label" text NOT NULL,
	"kind" "criterion_kind",
	"source" "criterion_source",
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"weight" smallint DEFAULT 0 NOT NULL,
	"legal_exception" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_decisions" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"verdict" "verdict" NOT NULL,
	"source" "decision_source" NOT NULL,
	"decided_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_runs" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"criteria_version" integer NOT NULL,
	"model" text,
	"prompt_version" text,
	"score" smallint,
	"verdict_ai" "verdict" NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_settings" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"pass_line" smallint DEFAULT 70 NOT NULL,
	"fail_line" smallint DEFAULT 40 NOT NULL,
	"auto_judge" boolean DEFAULT true NOT NULL,
	"confirm_rejections" boolean DEFAULT true NOT NULL,
	"weight_mode" "weight_mode" DEFAULT 'equal' NOT NULL,
	"criteria_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_settings_lines" CHECK ("screening_settings"."fail_line" between 0 and 100 and "screening_settings"."pass_line" between 1 and 100 and "screening_settings"."fail_line" < "screening_settings"."pass_line")
);
--> statement-breakpoint
CREATE TABLE "contact_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"mode" text NOT NULL,
	"company" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"category" text,
	"message" text,
	"consent" boolean NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"candidate_id" uuid,
	"candidate_name" text NOT NULL,
	"kind" "data_request_kind" NOT NULL,
	"status" "data_request_status" DEFAULT 'open' NOT NULL,
	"note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"handled_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "notifications_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entry_urls" ADD CONSTRAINT "entry_urls_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_urls" ADD CONSTRAINT "entry_urls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_urls" ADD CONSTRAINT "entry_urls_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_urls" ADD CONSTRAINT "entry_urls_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_images" ADD CONSTRAINT "job_images_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_images" ADD CONSTRAINT "job_images_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_images" ADD CONSTRAINT "job_images_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_entry_url_id_entry_urls_id_fk" FOREIGN KEY ("entry_url_id") REFERENCES "public"."entry_urls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_id_profiles_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_criteria" ADD CONSTRAINT "screening_criteria_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_criteria" ADD CONSTRAINT "screening_criteria_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_criteria" ADD CONSTRAINT "screening_criteria_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_runs" ADD CONSTRAINT "screening_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_runs" ADD CONSTRAINT "screening_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_runs" ADD CONSTRAINT "screening_runs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_settings" ADD CONSTRAINT "screening_settings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_settings" ADD CONSTRAINT "screening_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_settings" ADD CONSTRAINT "screening_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_handled_by_profiles_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_urls_job_channel_key" ON "entry_urls" USING btree ("job_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "job_images_job_slot_key" ON "job_images" USING btree ("job_id","slot");--> statement-breakpoint
CREATE INDEX "jobs_client_status_idx" ON "jobs" USING btree ("org_id","client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_candidate_key" ON "applications" USING btree ("job_id","candidate_id");--> statement-breakpoint
CREATE INDEX "applications_client_applied_idx" ON "applications" USING btree ("org_id","client_id","applied_at");--> statement-breakpoint
CREATE INDEX "applications_job_verdict_idx" ON "applications" USING btree ("job_id","verdict");--> statement-breakpoint
CREATE INDEX "applications_purge_idx" ON "applications" USING btree ("purge_after") WHERE "applications"."purge_after" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_org_email_key" ON "candidates" USING btree ("org_id","email_hash");--> statement-breakpoint
CREATE INDEX "candidates_org_phone_idx" ON "candidates" USING btree ("org_id","phone_hash");--> statement-breakpoint
CREATE INDEX "consents_application_idx" ON "consents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "documents_application_idx" ON "documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "ai_usage_org_idx" ON "ai_usage" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "screening_criteria_job_idx" ON "screening_criteria" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "screening_decisions_application_idx" ON "screening_decisions" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "screening_runs_application_idx" ON "screening_runs" USING btree ("application_id","created_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;