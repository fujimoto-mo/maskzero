CREATE TYPE "public"."entry_wait_status" AS ENUM('open', 'entered', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."inbound_kind" AS ENUM('job_board', 'candidate_reply', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_anchor" AS ENUM('applied', 'passed', 'interview_scheduled', 'interview_done', 'no_show', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."message_timing" AS ENUM('immediately', 'same_day_18', 'day_before_18', 'next_day_10', 'plus_3d_10', 'plus_1w_10');--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'remind_5d';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'remind_3d';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'interview_day';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'thanks';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'no_show';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'cv_missing';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'pool_suggestion';--> statement-breakpoint
ALTER TYPE "public"."message_trigger" ADD VALUE 'custom';--> statement-breakpoint
CREATE TABLE "custom_messages" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"anchor" "message_anchor" NOT NULL,
	"timing" "message_timing" DEFAULT 'immediately' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_waits" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"applicant_name" text NOT NULL,
	"inbound_email_id" uuid,
	"status" "entry_wait_status" DEFAULT 'open' NOT NULL,
	"application_id" uuid,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"application_id" uuid,
	"kind" "inbound_kind" NOT NULL,
	"channel" text,
	"from_hash" text,
	"from_enc" text,
	"subject_enc" text,
	"body_enc" text,
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"read_by" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email_kinds" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pool_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_application_id" uuid NOT NULL,
	"suggested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "nudge_msg_template" text;--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN "timing" "message_timing";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "custom_message_id" uuid;--> statement-breakpoint
ALTER TABLE "custom_messages" ADD CONSTRAINT "custom_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_messages" ADD CONSTRAINT "custom_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_messages" ADD CONSTRAINT "custom_messages_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_waits" ADD CONSTRAINT "entry_waits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_waits" ADD CONSTRAINT "entry_waits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_waits" ADD CONSTRAINT "entry_waits_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_waits" ADD CONSTRAINT "entry_waits_inbound_email_id_inbound_emails_id_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_waits" ADD CONSTRAINT "entry_waits_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_read_by_profiles_id_fk" FOREIGN KEY ("read_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_suggestions" ADD CONSTRAINT "pool_suggestions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_suggestions" ADD CONSTRAINT "pool_suggestions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_suggestions" ADD CONSTRAINT "pool_suggestions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_suggestions" ADD CONSTRAINT "pool_suggestions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_suggestions" ADD CONSTRAINT "pool_suggestions_source_application_id_applications_id_fk" FOREIGN KEY ("source_application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_suggestions" ADD CONSTRAINT "pool_suggestions_suggested_by_profiles_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_messages_org_anchor_idx" ON "custom_messages" USING btree ("org_id","anchor");--> statement-breakpoint
CREATE INDEX "entry_waits_client_status_idx" ON "entry_waits" USING btree ("org_id","client_id","status");--> statement-breakpoint
CREATE INDEX "inbound_emails_org_received_idx" ON "inbound_emails" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE INDEX "inbound_emails_application_idx" ON "inbound_emails" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_suggestions_candidate_job_key" ON "pool_suggestions" USING btree ("candidate_id","job_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_custom_message_id_custom_messages_id_fk" FOREIGN KEY ("custom_message_id") REFERENCES "public"."custom_messages"("id") ON DELETE set null ON UPDATE no action;