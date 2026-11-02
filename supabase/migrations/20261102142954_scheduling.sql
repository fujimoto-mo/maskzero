CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'unmatched', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."confirm_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'done', 'no_show', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."interview_tool" AS ENUM('url', 'onsite', 'meet', 'zoom', 'teams');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('sent', 'opened', 'booked', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('scheduled', 'sent', 'delivered', 'bounced', 'failed', 'canceled', 'dry_run');--> statement-breakpoint
CREATE TYPE "public"."message_trigger" AS ENUM('pass', 'follow_up', 'confirmed', 'reminder', 'rejection', 'next_round');--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"calendar_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"weekly" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"common_from" text DEFAULT '10:00' NOT NULL,
	"common_to" text DEFAULT '18:00' NOT NULL,
	"slot_minutes" smallint DEFAULT 60 NOT NULL,
	"later_round_minutes" smallint DEFAULT 90 NOT NULL,
	"buffer_minutes" smallint DEFAULT 0 NOT NULL,
	"exclude_weekends" boolean DEFAULT true NOT NULL,
	"exclude_holidays" boolean DEFAULT true NOT NULL,
	"window_days" smallint DEFAULT 42 NOT NULL,
	"min_notice_hours" smallint DEFAULT 24 NOT NULL,
	"cancel_cutoff_hours" smallint DEFAULT 24 NOT NULL,
	"confirm_mode" "confirm_mode" DEFAULT 'auto' NOT NULL,
	"tool" "interview_tool" DEFAULT 'url' NOT NULL,
	"fixed_meeting_url" text,
	"onsite_address" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_ranges" CHECK ("availability_rules"."slot_minutes" between 15 and 240
      and "availability_rules"."later_round_minutes" between 15 and 240 and "availability_rules"."buffer_minutes" between 0 and 120
      and "availability_rules"."window_days" between 1 and 180 and "availability_rules"."min_notice_hours" between 0 and 336
      and "availability_rules"."cancel_cutoff_hours" between 0 and 336)
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"preferred" jsonb NOT NULL,
	"concern_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"memo" text,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Tokyo' NOT NULL,
	"google_calendar_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concern_options" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"label" text NOT NULL,
	"answer" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_invitations" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"round" smallint DEFAULT 1 NOT NULL,
	"status" "invitation_status" DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_opened_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"followup_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"invitation_id" uuid,
	"calendar_id" uuid NOT NULL,
	"round" smallint DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"tool" "interview_tool" NOT NULL,
	"meeting_url" text,
	"location" text,
	"external_event_id" text,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_time_order" CHECK ("interviews"."ends_at" > "interviews"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "slot_overrides" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"open" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid,
	"trigger" "message_trigger" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"trigger" "message_trigger" NOT NULL,
	"to_email_enc" text,
	"subject" text NOT NULL,
	"body_rendered" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "message_status" DEFAULT 'scheduled' NOT NULL,
	"provider_message_id" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "portal_token_enc" text;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_invitation_id_interview_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."interview_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_options" ADD CONSTRAINT "concern_options_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_options" ADD CONSTRAINT "concern_options_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_invitations" ADD CONSTRAINT "interview_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_invitations" ADD CONSTRAINT "interview_invitations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_invitations" ADD CONSTRAINT "interview_invitations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_invitation_id_interview_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."interview_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_overrides" ADD CONSTRAINT "slot_overrides_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_overrides" ADD CONSTRAINT "slot_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_overrides" ADD CONSTRAINT "slot_overrides_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_requests_invitation_idx" ON "booking_requests" USING btree ("invitation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_client_pool_key" ON "calendars" USING btree ("client_id") WHERE "calendars"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_invitations_application_round_key" ON "interview_invitations" USING btree ("application_id","round");--> statement-breakpoint
CREATE INDEX "interviews_calendar_start_idx" ON "interviews" USING btree ("calendar_id","starts_at");--> statement-breakpoint
CREATE INDEX "interviews_application_idx" ON "interviews" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_overrides_calendar_start_key" ON "slot_overrides" USING btree ("calendar_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_org_trigger_key" ON "message_templates" USING btree ("org_id","trigger") WHERE "message_templates"."client_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_client_trigger_key" ON "message_templates" USING btree ("client_id","trigger") WHERE "message_templates"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_application_idx" ON "messages" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_provider_idx" ON "messages" USING btree ("provider_message_id");