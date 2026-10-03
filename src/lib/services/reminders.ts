import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { commitments, parties, remindersSent, swapAccess, swaps, type ReminderKind } from "@/db/schema";
import { formatDate, relativeDue } from "../dates";
import type { EmailSender } from "../email";
import { appUrl } from "../env";
import { dueReminderKind, reminderSubject } from "../reminders";

export interface ReminderRun {
  sent: number;
  /** Due a reminder, but the side has no email on file. */
  skipped: number;
  failed: number;
}

/**
 * Emails each side about its own commitments 3 days and 1 day before they're
 * due, and once when overdue. Safe to run as often as you like: a reminder is
 * claimed in the database before it's sent, so it never goes out twice.
 */
export async function runReminders(db: Db, send: EmailSender, now = new Date()): Promise<ReminderRun> {
  const pa = alias(parties, "pa");
  const pb = alias(parties, "pb");
  const rows = await db
    .select({
      commitment: commitments,
      swapTitle: swaps.title,
      partyA: { name: pa.name, contactName: pa.contactName, email: pa.email },
      partyB: { name: pb.name, contactName: pb.contactName, email: pb.email },
    })
    .from(commitments)
    .innerJoin(swaps, eq(swaps.id, commitments.swapId))
    .innerJoin(pa, eq(pa.id, swaps.partyAId))
    .innerJoin(pb, eq(pb.id, swaps.partyBId))
    .where(and(eq(swaps.status, "accepted"), eq(commitments.status, "pending")));

  const run: ReminderRun = { sent: 0, skipped: 0, failed: 0 };
  if (rows.length === 0) return run;

  const ids = rows.map((r) => r.commitment.id);
  const [sentRows, accessRows] = await Promise.all([
    db.select().from(remindersSent).where(inArray(remindersSent.commitmentId, ids)),
    db
      .select()
      .from(swapAccess)
      .where(inArray(swapAccess.swapId, [...new Set(rows.map((r) => r.commitment.swapId))])),
  ]);

  for (const row of rows) {
    const { commitment } = row;
    const already = sentRows.filter((s) => s.commitmentId === commitment.id).map((s) => s.kind);
    const kind = dueReminderKind(commitment, already, now);
    if (!kind) continue;

    const party = commitment.side === "a" ? row.partyA : row.partyB;
    const token = accessRows.find((a) => a.swapId === commitment.swapId && a.side === commitment.side)?.token;
    if (!party.email || !token) {
      run.skipped += 1;
      continue;
    }

    const [claim] = await db
      .insert(remindersSent)
      .values({ commitmentId: commitment.id, kind, sentAt: now })
      .onConflictDoNothing()
      .returning();
    if (!claim) continue; // Another run got here first.

    try {
      await send({
        to: party.email,
        subject: reminderSubject(kind, row.swapTitle),
        text: reminderText({
          kind,
          name: party.contactName ?? party.name,
          swapTitle: row.swapTitle,
          description: commitment.description,
          dueDate: commitment.dueDate,
          link: `${appUrl()}/d/${token}`,
          now,
        }),
      });
      run.sent += 1;
    } catch (error) {
      console.error(`Reminder for commitment ${commitment.id} failed`, error);
      // Release the claim so the next run retries.
      await db.delete(remindersSent).where(eq(remindersSent.id, claim.id));
      run.failed += 1;
    }
  }
  return run;
}

function reminderText(p: {
  kind: ReminderKind;
  name: string;
  swapTitle: string;
  description: string;
  dueDate: string;
  link: string;
  now: Date;
}): string {
  const when =
    p.kind === "overdue"
      ? `It was due ${formatDate(p.dueDate)} (${relativeDue(p.dueDate, p.now)}). If it's done, mark it delivered so your partner knows.`
      : `It's due ${formatDate(p.dueDate)} (${relativeDue(p.dueDate, p.now)}).`;
  return [
    `Hi ${p.name},`,
    ``,
    `A reminder about your swap "${p.swapTitle}".`,
    ``,
    `What you agreed to deliver: ${p.description}`,
    when,
    ``,
    `When it's done, mark it delivered and paste a link that shows it, like an archive page, a live listing, or a screenshot:`,
    p.link,
    ``,
    `Thanks for keeping your side of the swap.`,
    `Surka`,
  ].join("\n");
}
