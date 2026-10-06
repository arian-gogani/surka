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

/**
 * The windows above are ranges, so the kind is not a day count. Reading the
 * remaining days directly stops a subject saying "Due tomorrow" above a body
 * that says today, which happens whenever a swap is agreed inside its own
 * window: the public form allows a deadline as soon as today.
 */
export function reminderSubject(kind: ReminderKind, swapTitle: string, dueDate: string, now: Date): string {
  if (kind === "overdue") return `Overdue: your part of "${swapTitle}"`;
  const days = daysUntil(dueDate, now);
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `Due ${when}: your part of "${swapTitle}"`;
}
