-- One figure per side per measure. Rows written before the replacement
-- behaviour existed can already violate this, and a unique index that aborts
-- mid-deploy would take the whole build down, so collapse duplicates first and
-- keep the newest of each group, which is what the app would now show anyway.
DELETE FROM "results" r
USING "results" newer
WHERE r."swap_id" = newer."swap_id"
  AND r."side" = newer."side"
  AND r."metric" = newer."metric"
  AND (r."created_at", r."id") < (newer."created_at", newer."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "results_measure_idx" ON "results" USING btree ("swap_id","side","metric");
