import { and, eq, inArray, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import {
  commitments,
  events,
  parties,
  remindersSent,
  swapAccess,
  swaps,
  type ReminderKind,
  type Side,
} from "@/db/schema";
import { addDays, formatDate, relativeDue, toDateOnly } from "../dates";
import type { EmailProvider, EmailSender } from "../email";
import { appUrl } from "../env";
import { dueReminderKind, reminderSubject } from "../reminders";

/** Emails one run may send. Keeps a run bounded so it cannot die partway. */
export const MAX_PER_RUN = 100;

export interface ReminderRun {
  /** Delivered to a real address, and recorded so it never goes out twice. */
  sent: number;
  /** Due a reminder, but the side has no email on file. Recounted every run. */
  skipped: number;
  failed: number;
  /**
   * Due a reminder that nothing can deliver, because no provider is configured.
   *
   * Counted and deliberately not recorded. Booking these as sent is what used
   * to happen, and it burned the reminder for good: the window passed, the
   * once-only row stood, and that commitment was never chased again even after
   * a real key was added. A run of all-undeliverable is a loud zero, not a
   * quiet success.
   */
  undeliverable: number;
  /** Stopped at MAX_PER_RUN. The next run picks up where this one left off. */
  truncated: boolean;
  /** "log" until RESEND_API_KEY is set, so the two runs are distinguishable. */
  provider: EmailProvider;
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
    .where(
      and(
        eq(swaps.status, "accepted"),
        eq(commitments.status, "pending"),
        // The furthest-out window is 3 days, so anything later cannot be due a
        // reminder yet. Without this the run fetched every pending commitment
        // of every accepted swap, scanned them all, and threw most away.
        lte(commitments.dueDate, addDays(toDateOnly(now), 3)),
      ),
    );

  const provider: EmailProvider = "provider" in send ? (send.provider as EmailProvider) : "resend";
  // A sender that does not say either way is assumed to deliver, which is the
  // safe default: it books what it sends rather than sending twice.
  const delivers = "delivers" in send ? Boolean((send as { delivers?: unknown }).delivers) : true;
  const run: ReminderRun = {
    sent: 0,
    skipped: 0,
    failed: 0,
    undeliverable: 0,
    truncated: false,
    provider,
  };
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

    // Nothing is recorded when nothing can be delivered. The message still goes
    // to the log so a developer can read it, but the reminder stays due.
    if (!delivers) {
      run.undeliverable += 1;
      await send(messageFor(row, commitment, kind, party, token, now)).catch((error) => {
        console.error(`Could not log the reminder for commitment ${commitment.id}`, error);
      });
      continue;
    }

    if (run.sent >= MAX_PER_RUN) {
      run.truncated = true;
      break;
    }

    const [claim] = await db
      .insert(remindersSent)
      .values({ commitmentId: commitment.id, kind, sentAt: now })
      .onConflictDoNothing()
      .returning();
    if (!claim) continue; // Another run got here first.

    try {
      await send(messageFor(row, commitment, kind, party, token, now));
      run.sent += 1;
      // The operator's only window onto this. Without it the swap timeline and
      // both deal sheets showed no trace that a reminder had ever gone out, so
      // "we chased them" was unverifiable from inside the product.
      await logReminderEvent(db, commitment.swapId, commitment.side, kind).catch(() => {});
    } catch (error) {
      console.error(`Reminder for commitment ${commitment.id} failed`, error);
      try {
        // Release the claim so the next run retries. If this also fails, the
        // claim simply stands: one skipped reminder beats losing the whole run
        // and the record of everything already sent in it.
        await db.delete(remindersSent).where(eq(remindersSent.id, claim.id));
      } catch (releaseError) {
        console.error(`Could not release the reminder claim for ${commitment.id}`, releaseError);
      }
      run.failed += 1;
    }
  }
  return run;
}

/** One reminder's message, built the same way whoever is about to send it. */
function messageFor(
  row: { swapTitle: string },
  commitment: { id: string; description: string; dueDate: string },
  kind: ReminderKind,
  party: { name: string; contactName: string | null; email: string | null },
  token: string,
  now: Date,
) {
  return {
    to: party.email as string,
    subject: reminderSubject(kind, row.swapTitle, commitment.dueDate, now),
    text: reminderText({
      kind,
      name: party.contactName ?? party.name,
      swapTitle: row.swapTitle,
      description: commitment.description,
      dueDate: commitment.dueDate,
      link: `${appUrl()}/d/${token}`,
      now,
    }),
    // The natural key for this message: one reminder of one kind for one
    // commitment. A retry after a lost response cannot deliver a second copy.
    idempotencyKey: `reminder-${commitment.id}-${kind}`,
  };
}

async function logReminderEvent(db: Db, swapId: string, side: Side, kind: ReminderKind): Promise<void> {
  await db.insert(events).values({ swapId, type: "reminder_sent", side, detail: kind });
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
