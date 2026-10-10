import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { Db } from "@/db/client";
import {
  commitments,
  events,
  parties,
  responses,
  results,
  remindersSent,
  partyAccess,
  swapAccess,
  swaps,
  trackingLinks,
  type Commitment,
  type CommitmentStatus,
  type Confirmation,
  type PartyKind,
  type OpenedBy,
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
import { contactEmail } from "../env";
import type { SwapEventType } from "../events";
import { SurkaError } from "../errors";
import { newAccessToken, newTrackingCode } from "../ids";
import { type CheckedCommitment, computeRecord, NO_RECORD, type TrackRecord } from "../reputation";
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
  listingInput,
  partyIdentityInput,
  partyInput,
  proofInput,
  responseInput,
  sideEmailInput,
  resultInput,
  swapInput,
  trackingLinkInput,
  withdrawInput,
} from "../validation";

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new SurkaError(firstIssue(parsed.error), "invalid");
  return parsed.data;
}

async function logEvent(
  db: Db,
  swapId: string,
  type: SwapEventType,
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
 * What a link proves, and about what.
 *
 * The distinction is the whole authorisation model, so it lives in the type.
 * A "swap" link proves control of one side of one swap: answer that deal
 * sheet, deliver against it, report on it. A "party" link proves control of
 * the business itself: its name, its website, the address reminders go to, and
 * its public listing.
 *
 * Treating them as interchangeable was a takeover. The ordinary public flow
 * hands the proposer the partner's swap link on purpose, because somebody has
 * to send it. If that link also meant "I am this business", then anyone who
 * had ever proposed to you could later rewrite your name and website, point
 * your reminders at themselves, and then read the swap links for your other
 * swaps out of the reminder emails that followed.
 */
type TokenKind = "party" | "swap";

interface Holder {
  kind: TokenKind;
  partyId: string;
  swapId: string | null;
  side: Side | null;
}

async function holderOf(db: Db, token: string): Promise<Holder | null> {
  if (!token) return null;
  const [listing] = await db.select().from(partyAccess).where(eq(partyAccess.token, token)).limit(1);
  if (listing) return { kind: "party", partyId: listing.partyId, swapId: null, side: null };
  const [access] = await db.select().from(swapAccess).where(eq(swapAccess.token, token)).limit(1);
  if (!access) return null;
  const swap = await requireSwap(db, access.swapId);
  return {
    kind: "swap",
    partyId: access.side === "a" ? swap.partyAId : swap.partyBId,
    swapId: swap.id,
    side: access.side,
  };
}

const NOT_YOURS =
  "That link acts on one swap, not on the business. Use your listing link, or email us for one.";

/** Rejects a swap link where only proof of the business itself will do. */
async function requirePartyHolder(db: Db, token: string): Promise<Holder> {
  const holder = await holderOf(db, token);
  if (!holder) {
    throw new SurkaError("This link isn't valid. Ask the person who sent it for a new one.", "not_found");
  }
  if (holder.kind !== "party") throw new SurkaError(NOT_YOURS, "not_allowed");
  return holder;
}

/**
 * A swap link holder taking ownership of its own side's business.
 *
 * First claim wins, and there is no second. A business that already has a
 * listing link keeps it: minting another for whoever holds a swap link would
 * put the takeover straight back, because the ordinary flow gives the proposer
 * the partner's swap link. The cost is that a founder who loses their listing
 * link cannot mint a replacement from a swap link, which is the right way
 * round for a credential that is the entire account.
 */
export async function claimParty(db: Db, token: string): Promise<string> {
  const holder = await holderOf(db, token);
  if (!holder) {
    throw new SurkaError("This link isn't valid. Ask the person who sent it for a new one.", "not_found");
  }
  if (holder.kind === "party") return token;

  const taken = new SurkaError(
    "This business already has a listing link. Use that one, or email us if it's lost.",
    "conflict",
  );
  const [existing] = await db
    .select({ token: partyAccess.token })
    .from(partyAccess)
    .where(eq(partyAccess.partyId, holder.partyId))
    .limit(1);
  if (existing) throw taken;

  // Unique on partyId, so two simultaneous claims cannot both win.
  const [row] = await db
    .insert(partyAccess)
    .values({ token: newAccessToken(), partyId: holder.partyId })
    .onConflictDoNothing()
    .returning({ token: partyAccess.token });
  if (!row) throw taken;
  return row.token;
}

/**
 * The business a link belongs to, and whether that link may rewrite it.
 *
 * Carrying a business into a new swap is fine from either kind of link: it
 * only reuses a row. Rewriting the name, website or address is not, so the
 * caller is told which kind it is holding rather than left to assume.
 */
export async function partyForToken(
  db: Db,
  token: string,
): Promise<{ party: Party; canEditIdentity: boolean } | null> {
  const holder = await holderOf(db, token);
  if (!holder) return null;
  const [party] = await db.select().from(parties).where(eq(parties.id, holder.partyId)).limit(1);
  if (!party) return null;
  return { party, canEditIdentity: holder.kind === "party" };
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

/**
 * A link holder correcting their own business.
 *
 * Only the four fields the business owns about itself. Reusing updateParty
 * here would null out the operator's own contactName, offers, needs and notes,
 * because partyInput treats every absent optional field as an explicit null.
 */
export async function updatePartyIdentity(db: Db, partyId: string, input: unknown): Promise<Party> {
  const values = parse(partyIdentityInput, input);
  const [party] = await db.update(parties).set(values).where(eq(parties.id, partyId)).returning();
  if (!party) throw new SurkaError("That business doesn't exist.", "not_found");
  return party;
}

/** What the public directory shows. Never an email, a contact name, or notes. */
export interface Listing {
  id: string;
  name: string;
  kind: PartyKind;
  website: string | null;
  offers: string;
  needs: string;
  record: TrackRecord;
  listedAt: Date;
}

/**
 * A link holder asking to be findable, or asking to stop being.
 *
 * Gated on a token because the token is what proves the holder is that
 * business. Offers and needs are required to list: a directory entry that says
 * nothing is worse than no entry, since it costs a reader a click to find out.
 */
export async function setListed(
  db: Db,
  token: string,
  input: unknown,
  now = new Date(),
): Promise<Party> {
  const values = parse(listingInput, input);
  // A listing is a claim about the business, so only the business's own link
  // may make it. A swap link from a declined proposal used to keep rewriting
  // the other side's public copy forever.
  const holder = await requirePartyHolder(db, token);
  const [current] = await db
    .select({ listedAt: parties.listedAt })
    .from(parties)
    .where(eq(parties.id, holder.partyId))
    .limit(1);
  if (!current) throw new SurkaError("That business doesn't exist.", "not_found");
  const [party] = await db
    .update(parties)
    .set(
      values.listed
        ? {
            offers: values.offers,
            needs: values.needs,
            website: values.website,
            listingRequestedAt: now,
            // Editing a listing that is already public keeps it public. Only
            // the first appearance waits on a person, because that is where
            // the impersonation risk is.
            ...(current.listedAt ? {} : { listedAt: null }),
          }
        : { listingRequestedAt: null, listedAt: null },
    )
    .where(eq(parties.id, holder.partyId))
    .returning();
  if (!party) throw new SurkaError("That business doesn't exist.", "not_found");
  return party;
}

/**
 * The operator taking a listing off the public page.
 *
 * Separate from setListed, which needs the holder's token. Anyone can publish
 * to the directory with no account, so there has to be a remedy for spam, or
 * for text written about somebody else's business, that does not involve
 * editing the database by hand. It only clears listedAt: the business, its
 * link and its record survive, so a mistake here is not destructive.
 */
export async function unlistParty(db: Db, partyId: string): Promise<Party> {
  if (!isUuid(partyId)) throw new SurkaError("That business doesn't exist.", "not_found");
  // Clears the request too, or a declined listing would sit in the queue
  // forever waiting to be declined again.
  const [party] = await db
    .update(parties)
    .set({ listedAt: null, listingRequestedAt: null })
    .where(eq(parties.id, partyId))
    .returning();
  if (!party) throw new SurkaError("That business doesn't exist.", "not_found");
  return party;
}

/**
 * The operator letting a requested listing onto the public page.
 *
 * The whole gate. Nothing in the product can tell whether a listing is the
 * business it claims to be, so one person reads it before a stranger can.
 */
export async function approveListing(db: Db, partyId: string, now = new Date()): Promise<Party> {
  if (!isUuid(partyId)) throw new SurkaError("That business doesn't exist.", "not_found");
  const [party] = await db
    .update(parties)
    .set({ listedAt: now })
    .where(and(eq(parties.id, partyId), isNotNull(parties.listingRequestedAt)))
    .returning();
  if (!party) throw new SurkaError("That business hasn't asked to be listed.", "not_found");
  return party;
}

/**
 * Proposals aimed at the partner list that the recipient has not opened.
 *
 * Nothing emails a proposal, so a swap aimed at a listing reaches its
 * recipient only if they reopen the link they were told to bookmark. Without
 * this the directory funnel ended in silence for the proposer and invisibility
 * for the recipient, which is the worst place for it to end because those are
 * the people who got furthest. The operator chases them by hand, which is what
 * the pilot does for everything else too.
 */
export async function unseenProposals(db: Db): Promise<
  { swapId: string; title: string; partnerName: string; partnerEmail: string | null }[]
> {
  const pb = alias(parties, "pb");
  return db
    .select({
      swapId: swaps.id,
      title: swaps.title,
      partnerName: pb.name,
      partnerEmail: pb.email,
    })
    .from(swaps)
    .innerJoin(pb, eq(pb.id, swaps.partyBId))
    .innerJoin(swapAccess, and(eq(swapAccess.swapId, swaps.id), eq(swapAccess.side, "b")))
    .where(and(eq(swaps.openedBy, "directory"), eq(swaps.status, "proposed"), isNull(swapAccess.lastViewedAt)))
    .orderBy(asc(swaps.proposedAt));
}

/**
 * Another listed or previously listed business on the same website.
 *
 * A bad record is shed by delisting and submitting again: createListing makes
 * a fresh party row, and the record follows the row, so the new listing reads
 * "No swaps through Surka yet". Reusing the existing party here would be worse
 * than the problem, because it would hand whoever submitted the form a link to
 * a business they may not own. So the duplicate goes in front of the person
 * who already has to approve the listing, with the record it is trying to
 * leave behind.
 */
export interface SameSite {
  partyId: string;
  name: string;
  record: TrackRecord;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Listings waiting on the operator, oldest first: a queue, not a feed. */
export async function pendingListings(db: Db, now = new Date()): Promise<(Listing & { sameSite: SameSite[] })[]> {
  const rows = await db
    .select({
      id: parties.id,
      name: parties.name,
      kind: parties.kind,
      website: parties.website,
      offers: parties.offers,
      needs: parties.needs,
      listedAt: parties.listingRequestedAt,
    })
    .from(parties)
    .where(
      and(
        isNotNull(parties.listingRequestedAt),
        // Never approved, or rewritten since it was. An approved listing whose
        // text has been replaced is unreviewed text on a public page, which is
        // the thing this queue exists to prevent.
        or(isNull(parties.listedAt), gt(parties.listingRequestedAt, parties.listedAt)),
      ),
    )
    .orderBy(asc(parties.listingRequestedAt));
  const [records, everyone] = await Promise.all([
    partyRecords(db, now),
    db.select({ id: parties.id, name: parties.name, website: parties.website }).from(parties),
  ]);
  return rows.map((row) => {
    const host = hostOf(row.website);
    return {
      ...row,
      offers: row.offers ?? "",
      needs: row.needs ?? "",
      listedAt: row.listedAt as Date,
      record: records.get(row.id) ?? NO_RECORD,
      sameSite: host
        ? everyone
            .filter((p) => p.id !== row.id && hostOf(p.website) === host)
            .map((p) => ({ partyId: p.id, name: p.name, record: records.get(p.id) ?? NO_RECORD }))
        : [],
    };
  });
}

export interface CreatedListing {
  party: Party;
  token: string;
}

/**
 * The public way onto the partner list, with no swap behind it.
 *
 * Listing used to require a swap link, which only exists once you have already
 * run a swap with someone. That is a cold start the directory can never escape
 * on its own: nobody can list until they have swapped, and there is nobody
 * listed to swap with. This mints the business and its listing link together,
 * so the link is the only thing the holder has to keep.
 */
export async function createListing(db: Db, input: unknown, now = new Date()): Promise<CreatedListing> {
  const identity = parse(partyIdentityInput, input);
  // listed: true so the website requirement applies here too. The public form
  // is the one place a stranger's listing enters the queue, so it is the one
  // place the reviewable fields have to be present.
  const listing = parse(listingInput, { ...(input as object), listed: true });

  return db.transaction(async (tx) => {
    const [party] = await tx
      .insert(parties)
      // listedAt stays null: nothing here proves this is the business it says
      // it is, and the directory is an indexable page carrying whatever name
      // was typed.
      .values({ ...identity, offers: listing.offers, needs: listing.needs, listingRequestedAt: now })
      .returning();
    if (!party) throw new Error("Insert returned no row");
    const token = newAccessToken();
    await tx.insert(partyAccess).values({ token, partyId: party.id });
    return { party, token };
  });
}

/** What a business sees through its own listing link. */
export interface ListingView {
  party: Party;
  record: TrackRecord;
  /** Swaps this business is part of, so the link is a way back to all of them. */
  swaps: { id: string; title: string; status: SwapStatus; token: string | null }[];
}

export async function getListingForToken(
  db: Db,
  token: string,
  now = new Date(),
): Promise<ListingView | null> {
  const [access] = await db.select().from(partyAccess).where(eq(partyAccess.token, token)).limit(1);
  if (!access) return null;
  const [party] = await db.select().from(parties).where(eq(parties.id, access.partyId)).limit(1);
  if (!party) return null;

  const [record, rows] = await Promise.all([
    partyRecord(db, party.id, now),
    db
      .select({
        id: swaps.id,
        title: swaps.title,
        status: swaps.status,
        partyAId: swaps.partyAId,
        token: swapAccess.token,
        side: swapAccess.side,
      })
      .from(swaps)
      .leftJoin(swapAccess, eq(swapAccess.swapId, swaps.id))
      .where(or(eq(swaps.partyAId, party.id), eq(swaps.partyBId, party.id)))
      .orderBy(desc(swaps.createdAt)),
  ]);
  await db.update(partyAccess).set({ lastViewedAt: now }).where(eq(partyAccess.token, token));

  // Only this business's own side of each swap. The join returns both rows.
  const mine = new Map<string, ListingView["swaps"][number]>();
  for (const row of rows) {
    const ownSide = row.partyAId === party.id ? "a" : "b";
    if (!mine.has(row.id)) {
      mine.set(row.id, { id: row.id, title: row.title, status: row.status, token: null });
    }
    if (row.side === ownSide && row.token) mine.get(row.id)!.token = row.token;
  }
  return { party, record, swaps: [...mine.values()] };
}

/**
 * The public directory: businesses that asked to be found, newest first.
 *
 * One query for the rows and one for every record, because this page is the
 * growth loop and will be the most-read page on the site.
 */
export async function listListings(db: Db, now = new Date()): Promise<Listing[]> {
  const [rows, records] = await Promise.all([
    db
      .select({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        website: parties.website,
        offers: parties.offers,
        needs: parties.needs,
        listedAt: parties.listedAt,
      })
      .from(parties)
      .where(isNotNull(parties.listedAt))
      .orderBy(desc(parties.listedAt)),
    partyRecords(db, now),
  ]);
  return rows.map((row) => ({
    ...row,
    offers: row.offers ?? "",
    needs: row.needs ?? "",
    listedAt: row.listedAt as Date,
    record: records.get(row.id) ?? NO_RECORD,
  }));
}

/**
 * One listing, for prefilling a proposal aimed at a specific business.
 *
 * Its own query. This used to call listListings and pick one row out of the
 * result, which meant every unauthenticated GET of /start?with=<uuid> scanned
 * the whole parties table and joined every commitment to every swap, three
 * times per request, on a page with no rate limit. Only a listed business
 * resolves, so a public id is not a way to reach a private one.
 */
export async function getListing(db: Db, partyId: string, now = new Date()): Promise<Listing | null> {
  if (!isUuid(partyId)) return null;
  const [row] = await db
    .select({
      id: parties.id,
      name: parties.name,
      kind: parties.kind,
      website: parties.website,
      offers: parties.offers,
      needs: parties.needs,
      listedAt: parties.listedAt,
    })
    .from(parties)
    .where(and(eq(parties.id, partyId), isNotNull(parties.listedAt)))
    .limit(1);
  if (!row?.listedAt) return null;
  return {
    ...row,
    offers: row.offers ?? "",
    needs: row.needs ?? "",
    listedAt: row.listedAt,
    record: await partyRecord(db, row.id, now),
  };
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
/**
 * Swaps whose two sides were not both controlled by one person.
 *
 * The record is the only claim on a listing that a business cannot write about
 * itself, and that was not true. The public form creates both businesses and
 * hands the submitter both links, so one person could propose to a business
 * they invented, accept as that business, deliver against their own page, and
 * then only the operator's "does this proof look right" click stood between
 * them and a perfect public record. Three requests per point, repeatable.
 *
 * openedBy is exactly the right discriminator, because it records who held
 * what. "operator" means the operator entered both businesses and is also the
 * one checking, so there is a human who knows they are different. "directory"
 * means the proposal was aimed at an existing listing and that side's link was
 * withheld from the proposer, so they never controlled it. "proposer" means
 * the submitter walked away holding both links, and that is the one case a
 * self-dealer uses.
 *
 * A genuine swap between two founders who already know each other therefore
 * does not build a public record until one of them is on the partner list. The
 * swap still works, and both sides still see everything; the number simply
 * stops meaning something it could not back up.
 */
const INDEPENDENT: readonly OpenedBy[] = ["operator", "directory"];

export async function partyRecord(db: Db, partyId: string, now = new Date()): Promise<TrackRecord> {
  const rows = await db
    .select({
      status: commitments.status,
      verifiedAt: commitments.verifiedAt,
      dueDate: commitments.dueDate,
      deliveredAt: commitments.deliveredAt,
    })
    .from(commitments)
    .innerJoin(swaps, eq(swaps.id, commitments.swapId))
    .where(
      and(
        inArray(swaps.openedBy, INDEPENDENT),
        or(
          and(eq(commitments.side, "a"), eq(swaps.partyAId, partyId)),
          and(eq(commitments.side, "b"), eq(swaps.partyBId, partyId)),
        ),
      ),
    );
  return computeRecord(rows, now);
}

/**
 * Every party's record in one query.
 *
 * The businesses page needs a record per row, and asking per party meant one
 * round trip per business on a page whose whole job is to list them. The work
 * is the same scan either way, so do it once and bucket the rows in memory.
 */
export async function partyRecords(db: Db, now = new Date()): Promise<Map<string, TrackRecord>> {
  const rows = await db
    .select({
      status: commitments.status,
      verifiedAt: commitments.verifiedAt,
      dueDate: commitments.dueDate,
      deliveredAt: commitments.deliveredAt,
      side: commitments.side,
      partyAId: swaps.partyAId,
      partyBId: swaps.partyBId,
    })
    .from(commitments)
    .innerJoin(swaps, eq(swaps.id, commitments.swapId))
    // Same rule as partyRecord, for the same reason: a swap whose two links
    // were both held by one person cannot evidence anything about either side.
    .where(inArray(swaps.openedBy, INDEPENDENT));

  const byParty = new Map<string, CheckedCommitment[]>();
  for (const row of rows) {
    // A commitment belongs to whichever side promised it.
    const partyId = row.side === "a" ? row.partyAId : row.partyBId;
    const bucket = byParty.get(partyId);
    if (bucket) bucket.push(row);
    else byParty.set(partyId, [row]);
  }
  return new Map([...byParty].map(([partyId, items]) => [partyId, computeRecord(items, now)]));
}

// Swaps --------------------------------------------------------------------

export interface CreatedSwap {
  swap: Swap;
  /**
   * Both links, for the caller to hand out.
   *
   * A caller proposing to a business from the partner list must not receive
   * side B's token: it is that business's own proof of identity, and holding
   * it would let the proposer rewrite their public listing, their name, their
   * website and the address their reminders go to. Those callers pass
   * `withhold: "b"` and tell the partner nothing; the partner finds the
   * proposal on their own listing page.
   */
  tokens: Record<Side, string>;
}

/**
 * Creates a swap and its two private links.
 *
 * `proposed` lets the public form open a swap that is immediately live in the
 * same transaction. Doing that as a separate call afterwards meant a failure
 * in between left a swap in draft whose tokens had been generated but never
 * shown to anyone, so nobody on earth could reach it again.
 */
export async function createSwap(
  db: Db,
  input: unknown,
  {
    status = "draft" as Extract<SwapStatus, "draft" | "proposed">,
    openedBy = "operator" as OpenedBy,
    withhold = undefined as Side | undefined,
    now = new Date(),
  } = {},
): Promise<CreatedSwap> {
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
        status,
        openedBy,
        ...(status === "proposed" ? { proposedAt: now } : {}),
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
    // Both rows exist either way, so the withheld side can still reach its own
    // swap. The caller simply never sees the string.
    if (withhold) tokens[withhold] = "";
    await logEvent(tx, swap.id, "created");
    if (status === "proposed") await logEvent(tx, swap.id, "proposed");
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
  // Only on the first acceptance. Reopening a completed swap moves it back to
  // accepted, and stamping again rewrote when the deal was actually agreed.
  if (to === "accepted" && !swap.acceptedAt) stamps.acceptedAt = now;
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
      // By side and measure, not by when it was reported. Ordering by time
      // reshuffled the list every time anyone corrected a figure, and
      // interleaved the two sides, so the comparison this section exists for
      // had to be reassembled by eye on every visit.
      db
        .select()
        .from(results)
        .where(eq(results.swapId, swapId))
        .orderBy(asc(results.side), asc(results.metric)),
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

/**
 * One placement the other side made, as the figure it produced and nothing else.
 *
 * Deliberately not a TrackingLink. That row carries the code, and a code is the
 * other side's to publish: whoever holds it can point their own readers at it,
 * or hand it on, and every one of those clicks lands in the other side's column
 * as traffic this side sent them.
 */
export interface PartnerPlacement {
  label: string;
  clicks: number;
}

export interface SideView extends Omit<SwapDetail, "trackingLinks"> {
  side: Side;
  token: string;
  records: Record<Side, TrackRecord>;
  /** Only the links this side placed, which measure the traffic it sent. */
  trackingLinks: TrackingLink[];
  /**
   * The other side's placements, which measure the traffic this side received.
   *
   * Each side could see only what it sent, so neither could put a figure
   * against the results it was being asked to report, on a page that tells them
   * these links exist so both sides can see what the swap produced.
   */
  partnerPlacements: PartnerPlacement[];
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
  return {
    ...detail,
    side: access.side,
    token,
    records: { a: recordA, b: recordB },
    // Split here and not in the page. The page is a server component, so every
    // field of this object is serialised into the document whether or not
    // anything renders it: filtering at the far end of the wire would have left
    // the other side's codes sitting in the HTML of this side's page.
    trackingLinks: detail.trackingLinks.filter((l) => l.side === access.side),
    partnerPlacements: detail.trackingLinks
      .filter((l) => l.side !== access.side)
      .map((l) => ({ label: l.label, clicks: l.clicks })),
  };
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
    // The partner typing their address into their own deal sheet is the most
    // authoritative source there is. This used to write only where the column
    // was still null, so if the operator had guessed an address when creating
    // the business, the partner's real one was silently discarded and every
    // reminder went to the guess.
    if (values.email) {
      await tx.update(parties).set({ email: values.email }).where(eq(parties.id, swap.partyBId));
    }
    await logEvent(tx, swap.id, values.decision, { side: access.side, detail: values.message ?? undefined });
  });
  return next;
}

/**
 * A link holder sets the address reminders go to for their own side.
 *
 * Reminders are the product, and they only fire for a side with an address on
 * file. The partner is asked once, inside the accept form, and the proposer is
 * never asked at all, so without this a swap could run its whole length with
 * nobody being nudged and no way to turn that on.
 */
export async function setSideEmail(db: Db, token: string, input: unknown): Promise<void> {
  const { email } = parse(sideEmailInput, input);
  const access = await requireAccess(db, token);
  const swap = await requireSwap(db, access.swapId);
  // Only where reminders can actually fire. This had no gate at all, so a
  // token for a swap that was declined, cancelled, or never even sent kept
  // rewriting that business's address forever, and it is the address every
  // reminder for every other swap of theirs goes to.
  if (swap.status !== "accepted" && swap.status !== "completed") {
    throw new SurkaError("Reminders start once both sides have agreed to the swap.", "conflict");
  }
  const partyId = access.side === "a" ? swap.partyAId : swap.partyBId;
  await db.update(parties).set({ email }).where(eq(parties.id, partyId));
  await logEvent(db, swap.id, "email_set", { side: access.side });
}

/**
 * The owing side says in advance that this one will not happen.
 *
 * The reminder email tells people to do exactly this, and until now there was
 * nothing to do it with. A reminder whose only possible response is "deliver"
 * means whoever cannot deliver goes quiet, which leaves the partner waiting on
 * something that is not coming and the operator chasing it.
 *
 * Only your own side, and only before you have claimed delivery. It does not
 * touch the record: the deadline passing already counts an undelivered
 * commitment, and making early notice cost more than silence would be the
 * wrong way round. What it buys is that the partner finds out now and the
 * reminders stop.
 */
export async function withdrawCommitment(
  db: Db,
  token: string,
  commitmentId: string,
  note: unknown,
  now = new Date(),
): Promise<void> {
  const access = await requireAccess(db, token);
  const swap = await requireSwap(db, access.swapId);
  if (!isUuid(commitmentId)) throw new SurkaError("That commitment isn't part of this swap.", "not_found");

  const [commitment] = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.id, commitmentId), eq(commitments.swapId, swap.id)))
    .limit(1);
  if (!commitment) throw new SurkaError("That commitment isn't part of this swap.", "not_found");
  if (commitment.side !== access.side) {
    throw new SurkaError("You can only do this for what you agreed to deliver.", "not_allowed");
  }
  // The gate every sibling has and this one forgot. pending is the default in
  // every swap status, so without it a token for a draft, declined or
  // cancelled swap could write a call-off and 500 characters of note onto the
  // operator's screen for a swap nobody ever agreed to.
  if (swap.status !== "accepted") {
    throw new SurkaError("This only applies once both sides have agreed to the swap.", "conflict");
  }
  if (commitment.status !== "pending") {
    throw new SurkaError(
      commitment.status === "delivered"
        ? "You've already marked this delivered. Email us if that was wrong."
        : "This one has already been checked.",
      "conflict",
    );
  }

  const reason = parse(withdrawInput, { note }).note;
  // Guard on the status we read, like markDelivered and verifyCommitment. A
  // call-off racing a delivery would otherwise win after markDelivered had
  // cleared these fields, putting "called off" back onto a row that now has a
  // proof link, which is the contradiction markDelivered exists to prevent.
  const [changed] = await db
    .update(commitments)
    .set({ withdrawnAt: commitment.withdrawnAt ?? now, withdrawnNote: reason })
    .where(and(eq(commitments.id, commitment.id), eq(commitments.status, commitment.status)))
    .returning({ id: commitments.id });
  if (!changed) {
    throw new SurkaError("Someone else just changed this one. Reload the page and try again.", "conflict");
  }
  await logEvent(db, swap.id, "withdrawn", {
    side: access.side,
    detail: reason ? `${commitment.description}: ${reason}` : commitment.description,
  });
}

/**
 * The side that was owed something says whether it arrived.
 *
 * The delivering side writes its own proof link and the operator judges it, so
 * the one party who actually knows whether the section ran was never asked.
 *
 * Only the other side may answer, and only while the delivery is unchecked. It
 * is not a gate: the operator can still mark it kept over a "missing", because
 * requiring agreement would let a partner withhold credit by saying nothing,
 * which is ghosting pointed the other way. Both answers sit on the timeline and
 * on the operator's screen, which is what makes them worth having.
 */
export async function confirmDelivery(
  db: Db,
  token: string,
  commitmentId: string,
  said: Confirmation,
  now = new Date(),
): Promise<void> {
  if (said !== "arrived" && said !== "missing") {
    throw new SurkaError("Say whether it arrived or not.", "invalid");
  }
  const access = await requireAccess(db, token);
  const swap = await requireSwap(db, access.swapId);
  if (!isUuid(commitmentId)) throw new SurkaError("That commitment isn't part of this swap.", "not_found");

  const [commitment] = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.id, commitmentId), eq(commitments.swapId, swap.id)))
    .limit(1);
  if (!commitment) throw new SurkaError("That commitment isn't part of this swap.", "not_found");
  if (commitment.side === access.side) {
    throw new SurkaError("You can only answer for what the other side owed you.", "not_allowed");
  }
  if (commitment.status !== "delivered") {
    throw new SurkaError(
      commitment.status === "pending"
        ? "They haven't marked this delivered yet."
        : "This one has already been checked.",
      "conflict",
    );
  }

  await db
    .update(commitments)
    .set({ confirmedSaid: said, confirmedAt: now })
    .where(eq(commitments.id, commitment.id));
  await logEvent(db, swap.id, said === "arrived" ? "confirmed" : "disputed", {
    side: access.side,
    detail: commitment.description,
  });
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
    const contact = contactEmail();
    throw new SurkaError(
      `This one has already been checked as ${commitment.status}.` +
        (contact ? ` Email ${contact} if that was wrong.` : " Ask whoever set up this swap to reopen the check."),
      "conflict",
    );
  }
  // Guard on the status we read. A partner clicking Mark delivered at the same
  // moment the operator clicks Kept would otherwise overwrite the check: the
  // row ends up "delivered" with verifiedAt already set, the swap may already
  // have completed, and the side that actually delivered loses the credit.
  const [changed] = await db
    .update(commitments)
    .set({
      status: "delivered",
      proofUrl,
      // Keep the first delivery time. Re-pasting a corrected proof link should
      // not make a commitment delivered on time look late, or the reverse.
      deliveredAt: commitment.deliveredAt ?? now,
      // Clear the counterparty's answer. They judged a different link, and
      // leaving "missing" attached to replacement proof would be a verdict on
      // something nobody looked at.
      confirmedSaid: null,
      confirmedAt: null,
      // And clear a call-off. Changing your mind and shipping it anyway is a
      // good outcome, but the row would otherwise read "called off" next to a
      // proof link, which is a contradiction on the page both sides read.
      withdrawnAt: null,
      withdrawnNote: null,
    })
    .where(and(eq(commitments.id, commitment.id), eq(commitments.status, commitment.status)))
    .returning({ id: commitments.id });
  if (!changed) {
    throw new SurkaError("Someone else just changed this one. Reload the page and try again.", "conflict");
  }
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
  // Reopening is allowed on a completed swap: that is the whole point of being
  // able to undo a mis-check, and completing was the thing the mis-check caused.
  const reopening = outcome === "pending";
  const checkable = swap.status === "accepted" || (reopening && swap.status === "completed");
  if (!checkable) {
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
      .set({
        status: outcome,
        verifiedAt: outcome === "pending" ? null : now,
        // A verdict supersedes a call-off. Leaving it would put "called off"
        // next to "Kept" on the page both sides read, the same contradiction
        // markDelivered clears.
        withdrawnAt: null,
        withdrawnNote: null,
      })
      .where(and(eq(commitments.id, commitment.id), eq(commitments.status, commitment.status)))
      .returning({ id: commitments.id });
    if (!changed) throw new SurkaError("That commitment has already been checked.", "conflict");
    if (reopening) {
      // Reopening after a bad proof puts the commitment back in the reminder
      // query, but its spent windows would still be on file, so it would never
      // be chased again. Reopening the commitment reopens its schedule too.
      await tx.delete(remindersSent).where(eq(remindersSent.commitmentId, commitment.id));
    }
    await logEvent(tx, swap.id, reopening ? "reopened" : outcome, {
      side: commitment.side,
      detail: commitment.description,
    });

    const all = await tx
      .select({ status: commitments.status })
      .from(commitments)
      .where(eq(commitments.swapId, swap.id));

    if (!allResolved(all)) {
      // Reopening the one commitment that had completed the swap pulls the
      // swap back with it, so the deal sheet stops saying it is finished and
      // the delivery forms come back.
      if (swap.status === "completed") {
        await moveSwap(tx, swap, "accepted", now);
        await tx.update(swaps).set({ completedAt: null }).where(eq(swaps.id, swap.id));
        await logEvent(tx, swap.id, "reopened");
      }
      return { swapCompleted: false };
    }
    if (swap.status === "completed") return { swapCompleted: true };
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

/**
 * The operator taking a link out of service.
 *
 * There is no edit, on purpose. By the time anyone notices the destination is
 * wrong the code is already printed in a newsletter or a tweet, and quietly
 * repointing it would change what the reader was promised after the fact.
 * Retiring this one and creating another is the honest operation, and it leaves
 * the old URL dead rather than wrong.
 */
export async function retireTrackingLink(db: Db, code: string, now = new Date()): Promise<TrackingLink> {
  const [retired] = await db
    .update(trackingLinks)
    .set({ retiredAt: now })
    .where(and(eq(trackingLinks.code, code), isNull(trackingLinks.retiredAt)))
    .returning();
  if (retired) {
    await logEvent(db, retired.swapId, "link_retired", { side: retired.side, detail: retired.label });
    return retired;
  }
  // Retiring an already retired link is not a failure: the operator asked for
  // it to be out of service and it is. Guarding the write on retiredAt rather
  // than overwriting it keeps the moment the link stopped working where it was,
  // and keeps a double-tapped Retire from writing a second line into a timeline
  // both sides read.
  const [existing] = await db.select().from(trackingLinks).where(eq(trackingLinks.code, code)).limit(1);
  if (!existing) throw new SurkaError("That tracking link doesn't exist.", "not_found");
  return existing;
}

/**
 * Swap statuses that stop a code resolving, whatever its own state.
 *
 * Completed is deliberately not here: an issue is read for weeks after a swap
 * finishes, and those late clicks are the result. Declined and cancelled are a
 * different thing. Nothing used to check the swap at all, so a link from a deal
 * that never happened kept sending real readers to an ex-partner's site and
 * kept adding to a figure the other side reads as traffic this swap produced.
 */
const CALLED_OFF: SwapStatus[] = ["declined", "cancelled"];

/** The one row a code may still resolve to: not retired, on a swap still on. */
function liveLink(db: Db, code: string) {
  return and(
    eq(trackingLinks.code, code),
    isNull(trackingLinks.retiredAt),
    /*
     * Correlated EXISTS, not IN over a subquery.
     *
     * A subquery rather than a join, because recordClick is an update and has
     * to express the same condition in one statement. But the first version
     * was uncorrelated and the predicate was a negation, so swaps_status_idx
     * could not serve it and Postgres materialised every live swap id on every
     * click. This probes the primary key instead, and these codes are printed
     * in newsletters, so the per-click cost is set by strangers.
     */
    exists(
      db
        .select({ one: sql`1` })
        .from(swaps)
        .where(and(eq(swaps.id, trackingLinks.swapId), notInArray(swaps.status, CALLED_OFF))),
    ),
  );
}

/** Where a code points, without counting a visit. */
export async function destinationFor(db: Db, code: string): Promise<string | null> {
  const [row] = await db
    .select({ destinationUrl: trackingLinks.destinationUrl })
    .from(trackingLinks)
    .where(liveLink(db, code))
    .limit(1);
  return row?.destinationUrl ?? null;
}

/** Counts a click and returns where to send the visitor, or null. */
export async function recordClick(db: Db, code: string): Promise<string | null> {
  const [row] = await db
    .update(trackingLinks)
    // One statement, so a code that no longer resolves cannot be counted on the
    // way to being refused. The count is half of what both sides judge the swap
    // on, and a retired link was still adding to it.
    .set({ clicks: sql`${trackingLinks.clicks} + 1` })
    .where(liveLink(db, code))
    .returning({ destinationUrl: trackingLinks.destinationUrl });
  return row?.destinationUrl ?? null;
}

/**
 * One figure per side per measure, replaced rather than piled up.
 *
 * Reporting was a plain insert with no way back, so typing 5000 where you
 * meant 500 left both rows on the page with no timestamp and no delete. The
 * partner saw two contradictory numbers for the same measure and could not
 * tell which was live. Correcting it is the common case; keeping a running
 * series of the same measure is not something either side asked for.
 *
 * The timeline keeps every submission, so nothing is lost by replacing.
 */
export async function addResult(db: Db, swapId: string, input: unknown, now = new Date()): Promise<Result> {
  const values = parse(resultInput, input);
  const swap = await requireSwap(db, swapId);
  // The same gate reportResult has. Without it the operator could write a
  // figure into a draft or cancelled swap, where neither deal sheet renders
  // results, so it existed and was invisible to both sides.
  if (swap.status !== "accepted" && swap.status !== "completed") {
    throw new SurkaError("Results open once both sides have agreed to the swap.", "conflict");
  }
  const [row] = await db
    .insert(results)
    .values({ ...values, swapId })
    // One statement, so there is no window between removing the old figure and
    // writing the new one. A double-tapped submit updates the same row twice
    // instead of leaving two live figures for one measure.
    .onConflictDoUpdate({
      target: [results.swapId, results.side, results.metric],
      set: { value: values.value, note: values.note, createdAt: now },
    })
    .returning();
  if (!row) throw new Error("Upsert returned no row");
  await logEvent(db, swapId, "result_added", { side: row.side, detail: `${row.value} ${row.metric}` });
  return row;
}

/** A side reports growth it received. It can only report for itself. */
export async function reportResult(db: Db, token: string, input: unknown): Promise<Result> {
  const access = await requireAccess(db, token);
  const swap = await requireSwap(db, access.swapId);
  // A tab left open on a swap that was since cancelled or declined could still
  // write a result into it, and nothing on either page would ever show it.
  if (swap.status !== "accepted" && swap.status !== "completed") {
    throw new SurkaError("Results open once both sides have agreed to the swap.", "conflict");
  }
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
  /**
   * Commitments a side has called off.
   *
   * These wait on the operator as much as a delivery does: nothing else will
   * ever move them, reminders have stopped, and the record only counts them
   * once the deadline is well past.
   */
  calledOff: number;
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
  const [pending, delivered, calledOff] = await Promise.all([
    db
      .select({
        swapId: commitments.swapId,
        description: commitments.description,
        dueDate: commitments.dueDate,
        side: commitments.side,
      })
      .from(commitments)
      // A called-off commitment is not coming, so showing it as the next thing
      // due tells the operator to wait for something nobody is working on.
      .where(
        and(
          inArray(commitments.swapId, swapIds),
          eq(commitments.status, "pending"),
          isNull(commitments.withdrawnAt),
        ),
      )
      .orderBy(asc(commitments.dueDate)),
    db
      .select({ swapId: commitments.swapId })
      .from(commitments)
      .where(and(inArray(commitments.swapId, swapIds), eq(commitments.status, "delivered"))),
    // These wait on the operator too: nothing else will ever move them, and
    // the record counts them only once the deadline has long passed.
    db
      .select({ swapId: commitments.swapId })
      .from(commitments)
      .where(
        and(
          inArray(commitments.swapId, swapIds),
          eq(commitments.status, "pending"),
          isNotNull(commitments.withdrawnAt),
        ),
      ),
  ]);

  const checksBySwap = new Map<string, number>();
  for (const c of delivered) {
    checksBySwap.set(c.swapId, (checksBySwap.get(c.swapId) ?? 0) + 1);
  }
  const calledOffBySwap = new Map<string, number>();
  for (const c of calledOff) {
    calledOffBySwap.set(c.swapId, (calledOffBySwap.get(c.swapId) ?? 0) + 1);
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
    calledOff: calledOffBySwap.get(r.swap.id) ?? 0,
  }));
}
