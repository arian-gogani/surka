CREATE TABLE "party_access" (
	"token" text PRIMARY KEY NOT NULL,
	"party_id" uuid NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "party_access" ADD CONSTRAINT "party_access_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_access_party_idx" ON "party_access" USING btree ("party_id");