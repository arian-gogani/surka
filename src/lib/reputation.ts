import type { CommitmentStatus } from "@/db/schema";
import { DAY_MS } from "./dates";
import { isResolved } from "./swap-rules";

/** A kept commitment counts half as much after this many days. */
export const HALF_LIFE_DAYS = 180;

export interface CheckedCommitment {
  status: CommitmentStatus;
  verifiedAt: Date | null;
}

export interface TrackRecord {
  /** Commitments checked as kept. */
  kept: number;
  /** Commitments checked as kept or missed. */
  resolved: number;
  /** Share kept, weighted so old misses fade. Null before any history. */
  score: number | null;
}

/** A party nobody has checked yet. What computeRecord returns for no rows. */
export const NO_RECORD: TrackRecord = { kept: 0, resolved: 0, score: null };

/**
 * Reputation is kept commitments, never results: a partner controls whether
 * they deliver, not whether an audience clicks. Older outcomes fade so one
 * bad swap doesn't follow someone forever.
 */
export function computeRecord(items: readonly CheckedCommitment[], now: Date): TrackRecord {
  let kept = 0;
  let resolved = 0;
  let weightKept = 0;
  let weightAll = 0;

  for (const item of items) {
    if (!isResolved(item.status)) continue;
    resolved += 1;
    const ageDays = item.verifiedAt
      ? Math.max(0, (now.getTime() - item.verifiedAt.getTime()) / DAY_MS)
      : 0;
    const weight = 0.5 ** (ageDays / HALF_LIFE_DAYS);
    weightAll += weight;
    if (item.status === "kept") {
      kept += 1;
      weightKept += weight;
    }
  }

  return { kept, resolved, score: resolved === 0 ? null : weightKept / weightAll };
}

export function describeRecord(record: TrackRecord): string {
  if (record.resolved === 0) return "No swaps through Surka yet";
  const noun = record.resolved === 1 ? "commitment" : "commitments";
  return `Kept ${record.kept} of ${record.resolved} ${noun}`;
}
