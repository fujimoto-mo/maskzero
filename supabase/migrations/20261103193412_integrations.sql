CREATE TYPE "public"."integration_provider" AS ENUM('google', 'zoom', 'microsoft');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'error');--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"account_email" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"tokens_enc" text NOT NULL,
	"status" "integration_status" DEFAULT 'active' NOT NULL,
	"error" text,
	"connected_by" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_assists" (
	"interview_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"suggestions_enc" text NOT NULL,
	"segment_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_live_segments" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"at" real,
	"speaker_enc" text,
	"text_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bot_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_via" text DEFAULT 'mask0' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_via" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_profiles_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_assists" ADD CONSTRAINT "interview_assists_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_assists" ADD CONSTRAINT "interview_assists_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_assists" ADD CONSTRAINT "interview_assists_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_assists" ADD CONSTRAINT "interview_assists_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_live_segments" ADD CONSTRAINT "interview_live_segments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_live_segments" ADD CONSTRAINT "interview_live_segments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_live_segments" ADD CONSTRAINT "interview_live_segments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_live_segments" ADD CONSTRAINT "interview_live_segments_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_provider_key" ON "integrations" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "interview_live_segments_interview_idx" ON "interview_live_segments" USING btree ("interview_id","id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_email_via" CHECK ("organizations"."email_via" in ('mask0', 'gmail'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_bot_name_length" CHECK (char_length("organizations"."bot_name") between 1 and 40);