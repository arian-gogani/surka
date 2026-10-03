CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"swap_id" uuid NOT NULL,
	"side" text NOT NULL,
	"description" text NOT NULL,
	"due_date" date NOT NULL,
	"proof_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"swap_id" uuid NOT NULL,
	"type" text NOT NULL,
	"side" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'app' NOT NULL,
	"website" text,
	"contact_name" text,
	"email" text,
	"offers" text,
	"needs" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commitment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"swap_id" uuid NOT NULL,
	"side" text NOT NULL,
	"decision" text NOT NULL,
	"message" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"swap_id" uuid NOT NULL,
	"side" text NOT NULL,
	"metric" text NOT NULL,
	"value" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swap_access" (
	"token" text PRIMARY KEY NOT NULL,
	"swap_id" uuid NOT NULL,
	"side" text NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"party_a_id" uuid NOT NULL,
	"party_b_id" uuid NOT NULL,
	"notes" text,
	"operator_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proposed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tracking_links" (
	"code" text PRIMARY KEY NOT NULL,
	"swap_id" uuid NOT NULL,
	"side" text NOT NULL,
	"label" text NOT NULL,
	"destination_url" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_swap_id_swaps_id_fk" FOREIGN KEY ("swap_id") REFERENCES "public"."swaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_swap_id_swaps_id_fk" FOREIGN KEY ("swap_id") REFERENCES "public"."swaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_swap_id_swaps_id_fk" FOREIGN KEY ("swap_id") REFERENCES "public"."swaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_swap_id_swaps_id_fk" FOREIGN KEY ("swap_id") REFERENCES "public"."swaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_access" ADD CONSTRAINT "swap_access_swap_id_swaps_id_fk" FOREIGN KEY ("swap_id") REFERENCES "public"."swaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_party_a_id_parties_id_fk" FOREIGN KEY ("party_a_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_party_b_id_parties_id_fk" FOREIGN KEY ("party_b_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_swap_id_swaps_id_fk" FOREIGN KEY ("swap_id") REFERENCES "public"."swaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitments_swap_idx" ON "commitments" USING btree ("swap_id");--> statement-breakpoint
CREATE INDEX "events_swap_idx" ON "events" USING btree ("swap_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_once_idx" ON "reminders_sent" USING btree ("commitment_id","kind");--> statement-breakpoint
CREATE INDEX "responses_swap_idx" ON "responses" USING btree ("swap_id");--> statement-breakpoint
CREATE INDEX "results_swap_idx" ON "results" USING btree ("swap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swap_access_swap_side_idx" ON "swap_access" USING btree ("swap_id","side");--> statement-breakpoint
CREATE INDEX "swaps_status_idx" ON "swaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tracking_links_swap_idx" ON "tracking_links" USING btree ("swap_id");