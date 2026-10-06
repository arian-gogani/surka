import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { Db } from "@/db/client";
import {
  commitments,
  events,
  parties,
  responses,
  results,
  swapAccess,
  swaps,
  trackingLinks,
  type Commitment,
  type CommitmentStatus,
  type Party,
  type ResponseRow,
  type Result,
  type Side,
  type Swap,
  type SwapAccess,
  type SwapEvent,
  type SwapStatus,
  type TrackingLink,
} from "@/db/schema";
import { SurkaError } from "../errors";
import { newAccessToken, newTrackingCode } from "../ids";
import { computeRecord, type TrackRecord } from "../reputation";
import {
  allResolved,
  assertTransition,
  canMoveCommitment,
  hasBothSides,
  statusAfterDecision,
  termsEditable,
} from "../swap-rules";
import {
  commitmentInput,
  firstIssue,
  partyInput,
  proofInput,
  responseInput,
  resultInput,
  swapInput,
  trackingLinkInput,
} from "../validation";

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new SurkaError(firstIssue(parsed.error), "invalid");
  return parsed.data;
}

async function logEvent(
  db: Db,
  swapId: string,
  type: string,
  options: { side?: Side; detail?: string } = {},
): Promise<void> {
  await db.insert(events).values({
    swapId,
    type,
    side: options.side ?? null,
    detail: options.detail ?? null,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids are "not found", never a database error. */
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

async function requireSwap(db: Db, swapId: string): Promise<Swap> {
  if (!isUuid(swapId)) throw new SurkaError("That swap doesn't exist.", "not_found");
  const [swap] = await db.select().from(swaps).where(eq(swaps.id, swapId)).limit(1);
  if (!swap) throw new SurkaError("That swap doesn't exist.", "not_found");
  return swap;
}

async function requireAccess(db: Db, token: string): Promise<SwapAccess> {
  const [access] = await db.select().from(swapAccess).where(eq(swapAccess.token, token)).limit(1);
  if (!access) {
    throw new SurkaError("This link isn't valid. Ask the person who sent it for a new one.", "not_found");
  }
  return access;
}

// Parties ------------------------------------------------------------------

/**
 * The business on the holder's side of a swap link.
 *
 * Holding the token proves control of that side, which is what makes it safe
 * to carry the same party into a new swap. Without this, every swap started
 * from the public form mints a fresh business, so a founder's track record
 * never accumulates and "no swaps yet" shows forever.
 */
export async function partyForToken(db: Db, token: string): Promise<Party | null> {
  const [access] = await db.select().from(swapAccess).where(eq(swapAccess.token, token)).limit(1);
  if (!access) return null;
  const swap = await requireSwap(db, access.swapId);
  const partyId = access.side === "a" ? swap.partyAId : swap.partyBId;
  const [party] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
  return party ?? null;
}

export async function createParty(db: Db, input: unknown): Promise<Party> {
  const values = parse(partyInput, input);
  const [party] = await db.insert(parties).values(values).returning();
  if (!party) throw new Error("Insert returned no row");
  return party;
}

export async function updateParty(db: Db, partyId: string, input: unknown): Promise<Party> {
  if (!isUuid(partyId)) throw new SurkaError("That business doesn't exist.", "not_found");
  const values = parse(partyInput, input);
  const [party] = await db.update(parties).set(values).where(eq(parties.id, partyId)).returning();
  if (!party) throw new SurkaError("That business doesn't exist.", "not_found");
  return party;
}

export async function listParties(db: Db): Promise<Party[]> {
  return db.select().from(parties).orderBy(asc(parties.name));
}

export async function getParty(db: Db, partyId: string): Promise<Party | null> {
  if (!isUuid(partyId)) return null;
  const [party] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
  return party ?? null;
}

/** A party's history of kept and missed commitments across every swap. */
export async function partyRecord(db: Db, partyId: string, now = new Date()): Promise<TrackRecord> {
  const rows = await db
    .select({ status: commitments.status, verifiedAt: commitments.verifiedAt })
    .from(commitments)
    .innerJoin(swaps, eq(swaps.id, commitments.swapId))
    .where(
      or(
        and(eq(commitments.side, "a"), eq(swaps.partyAId, partyId)),
        and(eq(commitments.side, "b"), eq(swaps.partyBId, partyId)),
      ),
    );
  return computeRecord(rows, now);
}

// Swaps --------------------------------------------------------------------

export interface CreatedSwap {
  swap: Swap;
  tokens: Record<Side, string>;
}

export async function createSwap(db: Db, input: unknown): Promise<CreatedSwap> {
  const values = parse(swapInput, input);
  const found = await db
    .select({ id: parties.id })
    .from(parties)
    .where(inArray(parties.id, [values.partyAId, values.partyBId]));
  if (found.length !== 2) throw new SurkaError("Pick two businesses that exist.", "invalid");

  return db.transaction(async (tx) => {
    const [swap] = await tx
      .insert(swaps)
      .values({
        title: values.title,
        partyAId: values.partyAId,
        partyBId: values.partyBId,
        notes: values.notes,
      })
      .returning();
    if (!swap) throw new Error("Insert returned no row");

    await tx.insert(commitments).values(
      values.commitments.map((c, i) => ({ ...c, swapId: swap.id, sortOrder: i })),
    );

    const tokens: Record<Side, string> = { a: newAccessToken(), b: newAccessToken() };
    await tx.insert(swapAccess).values([
      { token: tokens.a, swapId: swap.id, side: "a" as const },
      { token: tokens.b, swapId: swap.id, side: "b" as const },
    ]);
    await logEvent(tx, swap.id, "created");
    return { swap, tokens };
  });
}

/** Rewrite the terms while they're still open (draft, or after a counter). */
export async function replaceCommitments(db: Db, swapId: string, input: unknown[]): Promise<void> {
  const swap = await requireSwap(db, swapId);
  if (!termsEditable(swap.status)) {
    throw new SurkaError("Terms are locked once both sides have agreed.", "conflict");
  }
  const list = input.map((item) => parse(commitmentInput, item));
  if (!hasBothSides(list)) {
    throw new SurkaError("Both sides need to give something. No trade, no swap.", "invalid");
  }
  await db.transaction(async (tx) => {
    await tx.delete(commitments).where(eq(commitments.swapId, swapId));
    await tx.insert(commitments).values(list.map((c, i) => ({ ...c, swapId, sortOrder: i })));
    await logEvent(tx, swapId, "terms_updated");
  });
}

/**
 * Moves a swap, refusing if anyone changed it since it was read.
 *
 * Both sides hold private links and act independently, so the gap between
 * reading a status and writing the next one is a real window, not a theoretical
 * one. Without the status in the WHERE clause, a partner who taps Accept and
 * then Decline lands both: each request reads "proposed", each passes the
 * transition check, and the row ends up declined but stamped as accepted.
 * Making the guard part of the write closes that for every caller at once.
 */
async function moveSwap(db: Db, swap: Swap, to: SwapStatus, now: Date): Promise<void> {
  assertTransition(swap.status, to);
  const stamps: Partial<Pick<Swap, "proposedAt" | "acceptedAt" | "completedAt" | "closedAt">> = {};
  if (to === "proposed") stamps.proposedAt = now;
  if (to === "accepted") stamps.acceptedAt = now;
  if (to === "completed") stamps.completedAt = now;
  if (to === "declined" || to === "cancelled") stamps.closedAt = now;
  const [moved] = await db
    .update(swaps)
    .set({ status: to, ...stamps })
    .where(and(eq(swaps.id, swap.id), eq(swaps.status, swap.status)))
    .returning({ id: swaps.id });
  if (!moved) {
    throw new SurkaError("Someone else just changed this swap. Reload the page and try again.", "conflict");
  }
}

/** The operator has sent (or re-sent) the deal sheet to the partner. */
export async function markProposed(db: Db, swapId: string, now = new Date()): Promise<void> {
  const swap = await requireSwap(db, swapId);
  await moveSwap(db, swap, "proposed", now);
  await logEvent(db, swapId, "proposed");
}

export async function cancelSwap(db: Db, swapId: string, reason?: string, now = new Date()): Promise<void> {
  const swap = await requireSwap(db, swapId);
  await moveSwap(db, swap, "cancelled", now);
  await logEvent(db, swapId, "cancelled", { detail: reason?.trim() || undefined });
}

export async function logOperatorMinutes(db: Db, swapId: string, minutes: number): Promise<void> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    throw new SurkaError("Log between 1 and 600 minutes at a time.", "invalid");
  }
  await requireSwap(db, swapId);
  await db
    .update(swaps)
    .set({ operatorMinutes: sql`${swaps.operatorMinutes} + ${minutes}` })
    .where(eq(swaps.id, swapId));
  await logEvent(db, swapId, "time_logged", { detail: `${minutes} min` });
}

export interface SwapDetail {
  swap: Swap;
  partyA: Party;
  partyB: Party;
  commitments: Commitment[];
  access: SwapAccess[];
  responses: ResponseRow[];
  trackingLinks: TrackingLink[];
  results: Result[];
  events: SwapEvent[];
}

export async function getSwapDetail(db: Db, swapId: string): Promise<SwapDetail> {
  const swap = await requireSwap(db, swapId);
  const [partyRows, commitmentRows, accessRows, responseRows, linkRows, resultRows, eventRows] =
    await Promise.all([
      db.select().from(parties).where(inArray(parties.id, [swap.partyAId, swap.partyBId])),
      db
        .select()
        .from(commitments)
        .where(eq(commitments.swapId, swapId))
        .orderBy(asc(commitments.sortOrder), asc(commitments.dueDate)),
      db.select().from(swapAccess).where(eq(swapAccess.swapId, swapId)),
      db.select().from(responses).where(eq(responses.swapId, swapId)).orderBy(desc(responses.createdAt)),
      db.select().from(trackingLinks).where(eq(trackingLinks.swapId, swapId)).orderBy(asc(trackingLinks.createdAt)),
      db.select().from(results).where(eq(results.swapId, swapId)).orderBy(desc(results.createdAt)),
      db.select().from(events).where(eq(events.swapId, swapId)).orderBy(desc(events.seq)),
    ]);
  const partyA = partyRows.find((p) => p.id === swap.partyAId);
  const partyB = partyRows.find((p) => p.id === swap.partyBId);
  if (!partyA || !partyB) throw new Error(`Swap ${swapId} references a missing party`);
  return {
    swap,
    partyA,
    partyB,
    commitments: commitmentRows,
    access: accessRows,
    responses: responseRows,
    trackingLinks: linkRows,
    results: resultRows,
    events: eventRows,
  };
}

export interface SideView extends SwapDetail {
  side: Side;
  token: string;
  records: Record<Side, TrackRecord>;
}

/** What one side sees through its private link. Marks the link as viewed. */
export async function getSwapForToken(db: Db, token: string, now = new Date()): Promise<SideView> {
  const access = await requireAccess(db, token);
  const detail = await getSwapDetail(db, access.swapId);
  const [recordA, recordB] = await Promise.all([
    partyRecord(db, detail.swap.partyAId, now),
    partyRecord(db, detail.swap.partyBId, now),
  ]);
  if (!access.lastViewedAt) {
    await logEvent(db, access.swapId, "viewed", { side: access.side });
  }
  await db.update(swapAccess).set({ lastViewedAt: now }).where(eq(swapAccess.token, token));
  return { ...detail, side: access.side, token, records: { a: recordA, b: recordB } };
}

/** The partner's answer to the deal sheet: accept, counter, or decline. */
export async function respond(db: Db, token: string, input: unknown, now = new Date()): Promise<SwapStatus> {
  const values = parse(responseInput, input);
  const access = await requireAccess(db, token);
  if (access.side !== "b") {
    throw new SurkaError("Only the partner who received this proposal can answer it.", "not_allowed");
  }
  const swap = await requireSwap(db, access.swapId);
  if (swap.status !== "proposed") {
    throw new SurkaError("This proposal isn't waiting on an answer anymore.", "conflict");
  }
  const next = statusAfterDecision(values.decision);

  await db.transaction(async (tx) => {
    await tx.insert(responses).values({
      swapId: swap.id,
      side: access.side,
      decision: values.decision,
      message: values.message,
      email: values.email,
    });
    await moveSwap(tx, swap, next, now);
    if (values.email) {
      await tx
        .update(parties)
        .set({ email: values.email })
        .where(and(eq(parties.id, swap.partyBId), sql`${parties.email} is null`));
    }
    await logEvent(tx, swap.id, values.decision, { side: access.side, detail: values.message ?? undefined });
  });
  return next;
}

/** A side marks its own commitment delivered, with a link that proves it. */
export async function markDelivered(
  db: Db,
  token: string,
  commitmentId: string,
  input: unknown,
  now = new Date(),
): Promise<void> {
  const { proofUrl } = parse(proofInput, input);
  const access = await requireAccess(db, token);
  const swap = await requireSwap(db, access.swapId);
  if (swap.status !== "accepted") {
    throw new SurkaError("Delivery opens once both sides have agreed to the swap.", "conflict");
  }
  if (!isUuid(commitmentId)) throw new SurkaError("That commitment isn't part of this swap.", "not_found");
  const [commitment] = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.id, commitmentId), eq(commitments.swapId, swap.id)))
    .limit(1);
  if (!commitment) throw new SurkaError("That commitment isn't part of this swap.", "not_found");
  if (commitment.side !== access.side) {
    throw new SurkaError("You can only mark your own side's commitments as delivered.", "not_allowed");
  }
  if (!canMoveCommitment(commitment.status, "delivered")) {
    throw new SurkaError("This one has already been checked.", "conflict");
  }
  // Guard on the status we read. A partner clicking Mark delivered at the same
  // moment the operator clicks Kept would otherwise overwrite the check: the
  // row ends up "delivered" with verifiedAt already set, the swap may already
  // have completed, and the side that actually delivered loses the credit.
  const [changed] = await db
    .update(commitments)
    .set({ status: "delivered", proofUrl, deliveredAt: now })
    .where(and(eq(commitments.id, commitment.id), eq(commitments.status, commitment.status)))
    .returning({ id: commitments.id });
  if (!changed) throw new SurkaError("This one has already been checked.", "conflict");
  await logEvent(db, swap.id, "delivered", { side: access.side, detail: commitment.description });
}

/**
 * The operator checks a commitment against its proof. When every commitment
 * is checked, the swap completes on its own.
 */
export async function verifyCommitment(
  db: Db,
  commitmentId: string,
  outcome: Extract<CommitmentStatus, "kept" | "missed" | "pending">,
  now = new Date(),
): Promise<{ swapCompleted: boolean }> {
  if (!isUuid(commitmentId)) throw new SurkaError("That commitment doesn't exist.", "not_found");
  const [commitment] = await db.select().from(commitments).where(eq(commitments.id, commitmentId)).limit(1);
  if (!commitment) throw new SurkaError("That commitment doesn't exist.", "not_found");
  const swap = await requireSwap(db, commitment.swapId);
  if (swap.status !== "accepted") {
    throw new SurkaError("Only swaps in progress can have commitments checked.", "conflict");
  }
  if (!canMoveCommitment(commitment.status, outcome)) {
    throw new SurkaError("That commitment has already been checked.", "conflict");
  }

  return db.transaction(async (tx) => {
    // Same compare-and-set as moveSwap: Kept and Missed sit 8px apart with no
    // pending state, so a slow page turns one intended click into two writes
    // and the last one wins. Here that would record the opposite outcome while
    // telling the operator the first one succeeded.
    const [changed] = await tx
      .update(commitments)
      .set({ status: outcome, verifiedAt: outcome === "pending" ? null : now })
      .where(and(eq(commitments.id, commitment.id), eq(commitments.status, commitment.status)))
      .returning({ id: commitments.id });
    if (!changed) throw new SurkaError("That commitment has already been checked.", "conflict");
    await logEvent(tx, swap.id, outcome === "pending" ? "reopened" : outcome, {
      side: commitment.side,
      detail: commitment.description,
    });

    const all = await tx
      .select({ status: commitments.status })
      .from(commitments)
      .where(eq(commitments.swapId, swap.id));
    if (!allResolved(all)) return { swapCompleted: false };
    await moveSwap(tx, swap, "completed", now);
    await logEvent(tx, swap.id, "completed");
    return { swapCompleted: true };
  });
}

// Tracking and results -------------------------------------------------------

export async function addTrackingLink(db: Db, swapId: string, input: unknown): Promise<TrackingLink> {
  const values = parse(trackingLinkInput, input);
  await requireSwap(db, swapId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [link] = await db
      .insert(trackingLinks)
      .values({ ...values, swapId, code: newTrackingCode() })
      .onConflictDoNothing()
      .returning();
    if (link) {
      await logEvent(db, swapId, "link_created", { side: link.side, detail: link.label });
      return link;
    }
  }
  throw new Error("Could not allocate a tracking code");
}

/** Counts a click and returns where to send the visitor, or null. */
export async function recordClick(db: Db, code: string): Promise<string | null> {
  const [row] = await db
    .update(trackingLinks)
    .set({ clicks: sql`${trackingLinks.clicks} + 1` })
    .where(eq(trackingLinks.code, code))
    .returning({ destinationUrl: trackingLinks.destinationUrl });
  return row?.destinationUrl ?? null;
}

export async function addResult(db: Db, swapId: string, input: unknown): Promise<Result> {
  const values = parse(resultInput, input);
  await requireSwap(db, swapId);
  const [row] = await db.insert(results).values({ ...values, swapId }).returning();
  if (!row) throw new Error("Insert returned no row");
  await logEvent(db, swapId, "result_added", { side: row.side, detail: `${row.value} ${row.metric}` });
  return row;
}

/** A side reports growth it received. It can only report for itself. */
export async function reportResult(db: Db, token: string, input: unknown): Promise<Result> {
  const access = await requireAccess(db, token);
  const raw = typeof input === "object" && input !== null ? input : {};
  return addResult(db, access.swapId, { ...raw, side: access.side });
}

// Lists ----------------------------------------------------------------------

export interface SwapListItem {
  swap: Swap;
  partyAName: string;
  partyBName: string;
  nextDue: Pick<Commitment, "description" | "dueDate" | "side"> | null;
  /**
   * Commitments a side has marked delivered that nobody has checked yet. These
   * have no due date left to run out, so without counting them a swap waiting
   * on the operator looks identical to one with nothing happening.
   */
  awaitingCheck: number;
}

export async function listSwaps(db: Db): Promise<SwapListItem[]> {
  const pa = alias(parties, "pa");
  const pb = alias(parties, "pb");
  const rows = await db
    .select({ swap: swaps, partyAName: pa.name, partyBName: pb.name })
    .from(swaps)
    .innerJoin(pa, eq(pa.id, swaps.partyAId))
    .innerJoin(pb, eq(pb.id, swaps.partyBId))
    .orderBy(desc(swaps.createdAt));
  if (rows.length === 0) return [];

  const swapIds = rows.map((r) => r.swap.id);
  const [pending, delivered] = await Promise.all([
    db
      .select({
        swapId: commitments.swapId,
        description: commitments.description,
        dueDate: commitments.dueDate,
        side: commitments.side,
      })
      .from(commitments)
      .where(and(inArray(commitments.swapId, swapIds), eq(commitments.status, "pending")))
      .orderBy(asc(commitments.dueDate)),
    db
      .select({ swapId: commitments.swapId })
      .from(commitments)
      .where(and(inArray(commitments.swapId, swapIds), eq(commitments.status, "delivered"))),
  ]);

  const checksBySwap = new Map<string, number>();
  for (const c of delivered) {
    checksBySwap.set(c.swapId, (checksBySwap.get(c.swapId) ?? 0) + 1);
  }
  const nextBySwap = new Map<string, SwapListItem["nextDue"]>();
  for (const c of pending) {
    if (!nextBySwap.has(c.swapId)) {
      nextBySwap.set(c.swapId, { description: c.description, dueDate: c.dueDate, side: c.side });
    }
  }
  return rows.map((r) => ({
    ...r,
    nextDue: nextBySwap.get(r.swap.id) ?? null,
    awaitingCheck: checksBySwap.get(r.swap.id) ?? 0,
  }));
}
