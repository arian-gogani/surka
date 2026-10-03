DROP INDEX "events_swap_idx";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "events_swap_idx" ON "events" USING btree ("swap_id","seq");