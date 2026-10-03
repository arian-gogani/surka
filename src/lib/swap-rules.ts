import type { CommitmentStatus, Decision, Side, SwapStatus } from "@/db/schema";
import { SurkaError } from "./errors";

const SWAP_TRANSITIONS: Record<SwapStatus, readonly SwapStatus[]> = {
  draft: ["proposed", "cancelled"],
  proposed: ["accepted", "countered", "declined", "cancelled"],
  countered: ["proposed", "declined", "cancelled"],
  accepted: ["completed", "cancelled"],
  completed: [],
  declined: [],
  cancelled: [],
};

export function canTransition(from: SwapStatus, to: SwapStatus): boolean {
  return SWAP_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SwapStatus, to: SwapStatus): void {
  if (!canTransition(from, to)) {
    throw new SurkaError(
      `A swap that is ${STATUS_LABEL[from].toLowerCase()} can't move to ${STATUS_LABEL[to].toLowerCase()}.`,
      "conflict",
    );
  }
}

export function isFinal(status: SwapStatus): boolean {
  return SWAP_TRANSITIONS[status].length === 0;
}

/** Terms can only change before both sides have agreed. */
export function termsEditable(status: SwapStatus): boolean {
  return status === "draft" || status === "countered";
}

export function statusAfterDecision(decision: Decision): SwapStatus {
  switch (decision) {
    case "accept":
      return "accepted";
    case "counter":
      return "countered";
    case "decline":
      return "declined";
  }
}

const COMMITMENT_TRANSITIONS: Record<CommitmentStatus, readonly CommitmentStatus[]> = {
  pending: ["delivered", "kept", "missed"],
  delivered: ["kept", "missed", "pending"],
  kept: [],
  missed: [],
};

export function canMoveCommitment(from: CommitmentStatus, to: CommitmentStatus): boolean {
  return COMMITMENT_TRANSITIONS[from].includes(to);
}

export function isResolved(status: CommitmentStatus): boolean {
  return status === "kept" || status === "missed";
}

/** A swap is done when every commitment has been checked as kept or missed. */
export function allResolved(items: readonly { status: CommitmentStatus }[]): boolean {
  return items.length > 0 && items.every((c) => isResolved(c.status));
}

/** No trade, no match: both sides must give something. */
export function hasBothSides(items: readonly { side: Side }[]): boolean {
  return items.some((c) => c.side === "a") && items.some((c) => c.side === "b");
}

export function otherSide(side: Side): Side {
  return side === "a" ? "b" : "a";
}

export const STATUS_LABEL: Record<SwapStatus, string> = {
  draft: "Draft",
  proposed: "Waiting on partner",
  countered: "Partner countered",
  accepted: "In progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const COMMITMENT_LABEL: Record<CommitmentStatus, string> = {
  pending: "Due",
  delivered: "Delivered, being checked",
  kept: "Kept",
  missed: "Missed",
};
