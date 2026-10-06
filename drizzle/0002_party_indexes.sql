CREATE INDEX "swaps_party_a_idx" ON "swaps" USING btree ("party_a_id");--> statement-breakpoint
CREATE INDEX "swaps_party_b_idx" ON "swaps" USING btree ("party_b_id");