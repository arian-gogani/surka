import {
  bigserial,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Plain text columns with TypeScript unions instead of Postgres enums keep
// migrations simple while the vocabulary is still changing. Every write goes
// through the validated service layer in src/lib.

export type Side = "a" | "b";
export type PartyKind = "app" | "newsletter" | "community" | "creator" | "other";
export type SwapStatus =
  | "draft"
  | "proposed"
  | "countered"
  | "accepted"
  | "completed"
  | "declined"
  | "cancelled";
export type CommitmentStatus = "pending" | "delivered" | "kept" | "missed";
/**
 * What the side that was owed something says about it.
 *
 * The delivering side supplies its own proof link and the operator judges it,
 * so the one party who actually knows whether the newsletter section ran was
 * never asked. This is that answer.
 */
export type Confirmation = "arrived" | "missing";
/**
 * Who has to get the partner their link.
 *
 * "directory" is the case where nobody does: the proposal was aimed at a
 * business already on the partner list, which finds it on its own listing
 * page. That matters for security, not just copy. Handing the proposer a token
 * for a business they do not own let them rewrite that business's public
 * listing, name, website and contact address.
 */
export type OpenedBy = "operator" | "proposer" | "directory";
export type Decision = "accept" | "counter" | "decline";
export type ReminderKind = "3d" | "1d" | "overdue";
export type ResultMetric = "installs" | "signups" | "trials" | "clicks" | "other";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A business on either side of a swap: an app, a newsletter, a community. */
export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").$type<PartyKind>().notNull().default("app"),
  website: text("website"),
  contactName: text("contact_name"),
  email: text("email"),
  offers: text("offers"),
  needs: text("needs"),
  /** Operator-only. Never shown to either side, and never in the directory. */
  notes: text("notes"),
  /**
   * When this business asked to be on the partner list, or null.
   *
   * Opt-in, and only ever set by someone holding one of that business's links,
   * which is what proves they are it. Asking is not the same as appearing:
   * see listedAt.
   */
  listingRequestedAt: timestamp("listing_requested_at", { withTimezone: true }),
  /**
   * When the operator let it onto the public list, or null.
   *
   * Nothing verifies that a listing is the business it claims to be, and the
   * directory is an indexable page carrying a name, a link and two paragraphs
   * of self-written copy. Publishing on submit meant anyone could put a well
   * known company, or a competitor, on it and say anything under their name.
   * Email verification is the usual answer and needs an email provider; one
   * operator reading one queue needs nothing and holds today.
   */
  listedAt: timestamp("listed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Secret link a business uses to manage its own listing. No accounts.
 *
 * Separate from swapAccess because a business can exist before any swap does:
 * listing used to require having already run one, which is a cold start the
 * directory could never escape. A swap link proves control of a side; this
 * proves control of the business itself.
 */
export const partyAccess = pgTable(
  "party_access",
  {
    token: text("token").primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  // Unique, not just indexed: one listing link per business, so two
  // simultaneous claims cannot both mint one, and a business that already has
  // a link never gets a second handed to a swap-link holder.
  (t) => [uniqueIndex("party_access_party_idx").on(t.partyId)],
);

/** One trade between two parties. Side A proposes, side B receives. */
export const swaps = pgTable(
  "swaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    status: text("status").$type<SwapStatus>().notNull().default("draft"),
    partyAId: uuid("party_a_id")
      .notNull()
      .references(() => parties.id),
    partyBId: uuid("party_b_id")
      .notNull()
      .references(() => parties.id),
    notes: text("notes"),
    /**
     * Who opened the swap, and therefore whose job it is to get the partner
     * their link. An operator hands it over themselves; a proposer using the
     * public form has to send it, so their own page has to show it to them.
     */
    openedBy: text("opened_by").$type<OpenedBy>().notNull().default("operator"),
    /** Minutes the operator spent running this swap by hand. */
    operatorMinutes: integer("operator_minutes").notNull().default(0),
    createdAt: createdAt(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("swaps_status_idx").on(t.status),
    // Both sides of a swap are looked up by party: the businesses page walks
    // every party's commitments through these two columns.
    index("swaps_party_a_idx").on(t.partyAId),
    index("swaps_party_b_idx").on(t.partyBId),
  ],
);

/** Something one side promised to deliver, by a date. */
export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    swapId: uuid("swap_id")
      .notNull()
      .references(() => swaps.id, { onDelete: "cascade" }),
    side: text("side").$type<Side>().notNull(),
    description: text("description").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    proofUrl: text("proof_url"),
    status: text("status").$type<CommitmentStatus>().notNull().default("pending"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /**
     * The counterparty's answer, and when they gave it.
     *
     * Deliberately not a gate on the operator's check. Requiring it would let
     * a partner withhold credit by saying nothing, which is the same ghosting
     * problem pointed the other way. It is evidence put in front of the person
     * deciding, and visible to both sides, which is what it is good for.
     */
    confirmedSaid: text("confirmed_said").$type<Confirmation>(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("commitments_swap_idx").on(t.swapId),
    // The reminder run asks for pending commitments due within three days,
    // every day, forever. Nothing indexed status, so it scanned the table.
    index("commitments_due_idx").on(t.status, t.dueDate),
  ],
);

/** Secret link each side uses to view and act on its swap. No accounts. */
export const swapAccess = pgTable(
  "swap_access",
  {
    token: text("token").primaryKey(),
    swapId: uuid("swap_id")
      .notNull()
      .references(() => swaps.id, { onDelete: "cascade" }),
    side: text("side").$type<Side>().notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("swap_access_swap_side_idx").on(t.swapId, t.side)],
);

/** Accept, counter, or decline from a side, with an optional message. */
export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    swapId: uuid("swap_id")
      .notNull()
      .references(() => swaps.id, { onDelete: "cascade" }),
    side: text("side").$type<Side>().notNull(),
    decision: text("decision").$type<Decision>().notNull(),
    message: text("message"),
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [index("responses_swap_idx").on(t.swapId)],
);

/** Redirect link placed in one side's channel, pointing at the other side. */
export const trackingLinks = pgTable(
  "tracking_links",
  {
    code: text("code").primaryKey(),
    swapId: uuid("swap_id")
      .notNull()
      .references(() => swaps.id, { onDelete: "cascade" }),
    /** The side whose newsletter, app, or channel carries this link. */
    side: text("side").$type<Side>().notNull(),
    label: text("label").notNull(),
    destinationUrl: text("destination_url").notNull(),
    clicks: integer("clicks").notNull().default(0),
    /**
     * When the operator took this link out of service, or null.
     *
     * There is no edit for a tracking link, because by the time anyone notices
     * a wrong destination the code is already printed in somebody's newsletter.
     * Retiring one and making another is the only honest operation. Without a
     * way to retire, a link lived forever: a typo kept sending real readers to
     * the wrong place, and a link on a cancelled or declined swap kept
     * delivering traffic to an ex-partner and kept adding to a count both
     * sides read as this swap's result.
     *
     * Retiring never touches clicks. The visits happened, and the count is
     * half of what the two sides use to judge whether to swap again.
     */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("tracking_links_swap_idx").on(t.swapId)],
);

/** Numbers a side reports, like installs from the swap. Private to the swap. */
export const results = pgTable(
  "results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    swapId: uuid("swap_id")
      .notNull()
      .references(() => swaps.id, { onDelete: "cascade" }),
    /** The side that received this growth. */
    side: text("side").$type<Side>().notNull(),
    metric: text("metric").$type<ResultMetric>().notNull(),
    value: integer("value").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("results_swap_idx").on(t.swapId),
    // One figure per side per measure, enforced here rather than by a
    // delete-then-insert. Two concurrent submits both found nothing to delete
    // and both inserted, which is exactly the pair of contradictory numbers
    // the replacement behaviour exists to prevent.
    uniqueIndex("results_measure_idx").on(t.swapId, t.side, t.metric),
  ],
);

/** Append-only timeline of everything that happened to a swap. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    swapId: uuid("swap_id")
      .notNull()
      .references(() => swaps.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    side: text("side").$type<Side>(),
    detail: text("detail"),
    /** Insertion order. Events written in one transaction share a timestamp. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_swap_idx").on(t.swapId, t.seq)],
);

/** One row per reminder sent, so a reminder never goes out twice. */
export const remindersSent = pgTable(
  "reminders_sent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReminderKind>().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminders_once_idx").on(t.commitmentId, t.kind)],
);

export type Party = typeof parties.$inferSelect;
export type Swap = typeof swaps.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type SwapAccess = typeof swapAccess.$inferSelect;
export type PartyAccess = typeof partyAccess.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type TrackingLink = typeof trackingLinks.$inferSelect;
export type Result = typeof results.$inferSelect;
export type SwapEvent = typeof events.$inferSelect;
