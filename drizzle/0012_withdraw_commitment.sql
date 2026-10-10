ALTER TABLE "commitments" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "withdrawn_note" text;