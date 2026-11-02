ALTER TABLE "documents" ADD COLUMN "injection_suspected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "screening_runs" ADD COLUMN "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;