-- One listing link per business. Only createListing ever inserted into this
-- table, one row per party, so there are no duplicates to collapse first.
-- IF EXISTS because a non-unique index of the same name may or may not be
-- present depending on when a database was first created.
DROP INDEX IF EXISTS "party_access_party_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "party_access_party_idx" ON "party_access" USING btree ("party_id");