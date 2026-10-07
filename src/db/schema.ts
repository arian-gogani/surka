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
export type OpenedBy = "operator" | "proposer";
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
   * When this business asked to be findable, or null.
   *
   * Opt-in, and only ever set by someone holding one of that business's swap
   * links, which is what proves they are it. Until a swap needed two founders
   * who already knew each other, which meant every swap needed the operator to
   * personally know both of them.
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
  (t) => [index("party_access_party_idx").on(t.partyId)],
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
  (t) => [index("results_swap_idx").on(t.swapId)],
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
