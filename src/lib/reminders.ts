import type { CommitmentStatus, ReminderKind } from "@/db/schema";
import { daysUntil } from "./dates";

/**
 * Which reminder, if any, a commitment needs right now. Windows instead of
 * exact days, so a missed cron run catches up instead of skipping.
 */
export function dueReminderKind(
  commitment: { status: CommitmentStatus; dueDate: string },
  alreadySent: readonly ReminderKind[],
  now: Date,
): ReminderKind | null {
  if (commitment.status !== "pending") return null;
  const days = daysUntil(commitment.dueDate, now);
  if (days < 0) return alreadySent.includes("overdue") ? null : "overdue";
  if (days <= 1) return alreadySent.includes("1d") ? null : "1d";
  if (days <= 3) {
    return alreadySent.includes("3d") || alreadySent.includes("1d") ? null : "3d";
  }
  return null;
}

export function reminderSubject(kind: ReminderKind, swapTitle: string): string {
  switch (kind) {
    case "3d":
      return `Due in 3 days: your part of "${swapTitle}"`;
    case "1d":
      return `Due tomorrow: your part of "${swapTitle}"`;
    case "overdue":
      return `Overdue: your part of "${swapTitle}"`;
  }
}
