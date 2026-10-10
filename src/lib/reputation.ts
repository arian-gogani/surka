import type { CommitmentStatus } from "@/db/schema";
import { daysUntil } from "./dates";
import { isResolved } from "./swap-rules";

export interface CheckedCommitment {
  status: CommitmentStatus;
  verifiedAt: Date | null;
  /** Date-only, as stored. Needed to tell an abandoned promise from a live one. */
  dueDate: string;
}

/**
 * How long past a deadline a promise stays uncounted.
 *
 * Abandoning a commitment used to be free and invisible. Nothing writes
 * "missed" except the operator's button, and the reminder run gives up after
 * one overdue notice, so a party could accept a swap, never deliver, and keep
 * showing "Kept 2 of 2" while three accepted commitments sat years overdue.
 * The denominator was the operator's workload, not the business's promises.
 *
 * Two weeks is long enough to cover a slipped issue or a holiday, and short
 * enough that ghosting costs what a miss costs.
 */
export const ABANDONED_AFTER_DAYS = 14;

export interface TrackRecord {
  /** Commitments checked as kept. */
  kept: number;
  /** Commitments checked as kept or missed. */
  resolved: number;
}

/** A party nobody has checked yet. What computeRecord returns for no rows. */
export const NO_RECORD: TrackRecord = { kept: 0, resolved: 0 };

/**
 * Reputation is kept commitments, never results: a partner controls whether
 * they deliver, not whether an audience clicks.
 *
 * There used to be a weighted score here, with a 180 day half life, so that an
 * old miss faded behind recent kept commitments. It was computed on every call
 * and read by nothing: both pages that show a record call describeRecord,
 * which counts raw kept and resolved. So the file documented a decay the
 * product did not have, and a test pinned the weighting of a number nobody
 * could see. Deleted rather than wired up, because deciding how reputation
 * ages is a product decision and the honest default is the one a reader can
 * verify by counting. If decay comes back it belongs in describeRecord, which
 * is the only thing anyone reads.
 */
export function computeRecord(items: readonly CheckedCommitment[], now: Date): TrackRecord {
  let kept = 0;
  let resolved = 0;
  for (const item of items) {
    if (isResolved(item.status)) {
      resolved += 1;
      if (item.status === "kept") kept += 1;
      continue;
    }
    // Only "pending". A "delivered" commitment the operator has not got to yet
    // is waiting on us, and counting it against the party who did their part
    // would charge them for our latency.
    if (item.status !== "pending") continue;
    if (daysUntil(item.dueDate, now) <= -ABANDONED_AFTER_DAYS) resolved += 1;
  }
  return { kept, resolved };
}

export function describeRecord(record: TrackRecord): string {
  if (record.resolved === 0) return "No swaps through Surka yet";
  const noun = record.resolved === 1 ? "commitment" : "commitments";
  return `Kept ${record.kept} of ${record.resolved} ${noun}`;
}
