import type { CommitmentStatus } from "@/db/schema";
import { isResolved } from "./swap-rules";

export interface CheckedCommitment {
  status: CommitmentStatus;
  verifiedAt: Date | null;
}

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
export function computeRecord(items: readonly CheckedCommitment[], _now: Date): TrackRecord {
  let kept = 0;
  let resolved = 0;
  for (const item of items) {
    if (!isResolved(item.status)) continue;
    resolved += 1;
    if (item.status === "kept") kept += 1;
  }
  return { kept, resolved };
}

export function describeRecord(record: TrackRecord): string {
  if (record.resolved === 0) return "No swaps through Surka yet";
  const noun = record.resolved === 1 ? "commitment" : "commitments";
  return `Kept ${record.kept} of ${record.resolved} ${noun}`;
}
