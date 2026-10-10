import { and, eq, gt, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { commitments, parties, results, swaps, type ResultMetric, type SwapStatus } from "@/db/schema";
import { DAY_MS } from "../dates";

export interface PilotMetrics {
  swapsByStatus: Record<SwapStatus, number>;
  completedThisWeek: number;
  /** Kept ÷ checked commitments. Null until something has been checked. */
  onTimeRate: number | null;
  keptCommitments: number;
  checkedCommitments: number;
  /**
   * Kept commitments that beat their deadline.
   *
   * The Phase 0 gate is written in on-time delivery, and onTimeRate was never
   * that: it counted kept whenever it was checked, so a delivery three months
   * late lifted it. deliveredAt was compared to dueDate nowhere.
   */
  onTimeCommitments: number;
  /** Accepted ÷ answered proposals. */
  acceptanceRate: number | null;
  /** Average operator minutes, over completed swaps where time was logged. */
  minutesPerCompletedSwap: number | null;
  /** How many that average covers, so missing data reads as missing. */
  swapsWithTimeLogged: number;
  /** Businesses that agreed to more than one swap. */
  repeatParties: number;
  /**
   * Completed swaps where nothing was missed. The Phase 0 gate is written in
   * swaps ("3 of 5 on time"), while onTimeRate is per commitment, so a swap
   * that half delivered still lifts that percentage. This counts whole swaps.
   */
  swapsFullyKept: number;
  completedSwaps: number;
  resultTotals: Partial<Record<ResultMetric, number>>;
  /** Businesses on the public partner list. */
  listedParties: number;
  /**
   * Listings asked for and not yet decided.
   *
   * The only thing standing between a stranger and an indexable page carrying
   * whatever business name they typed, so it belongs where the operator looks.
   */
  pendingListings: number;
  /**
   * Sides of a live swap with a pending deadline and no email on file.
   *
   * Nothing will ever chase these, and the only previous signal was a
   * "skipped" counter in a cron response body nobody reads. Chasing deadlines
   * is the product, so a swap it cannot chase belongs on the dashboard.
   */
  unchaseableSides: number;
}

const ALL_STATUSES: SwapStatus[] = [
  "draft",
  "proposed",
  "countered",
  "accepted",
  "completed",
  "declined",
  "cancelled",
];

/** The pilot scoreboard: the numbers from the plan's "numbers to watch". */
export async function pilotMetrics(db: Db, now = new Date()): Promise<PilotMetrics> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [
    statusRows,
    weekRows,
    commitmentRows,
    onTimeRows,
    minutesRows,
    partyRows,
    fullyKeptRows,
    answerRows,
    resultRows,
    listedRows,
    pendingRows,
    unchaseableRows,
  ] = await Promise.all([
    db.select({ status: swaps.status, n: sql<number>`count(*)::int` }).from(swaps).groupBy(swaps.status),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(swaps)
      .where(and(eq(swaps.status, "completed"), gte(swaps.completedAt, weekAgo))),
    db
      .select({ status: commitments.status, n: sql<number>`count(*)::int` })
      .from(commitments)
      .where(inArray(commitments.status, ["kept", "missed"]))
      .groupBy(commitments.status),
    // Compared as whole days, like every other deadline here, so a delivery on
    // the due date counts however late in the day it landed.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(commitments)
      .where(
        and(
          eq(commitments.status, "kept"),
          isNotNull(commitments.deliveredAt),
          sql`(${commitments.deliveredAt} at time zone 'UTC')::date <= ${commitments.dueDate}`,
        ),
      ),
    db
      // Only swaps where time was actually logged. operatorMinutes defaults to
      // zero, so averaging over all completed swaps counted every swap the
      // operator forgot to log as a swap that took no time, and this is the
      // number used to decide what is worth automating.
      .select({
        avg: sql<number | null>`avg(${swaps.operatorMinutes})::float`,
        logged: sql<number>`count(*)::int`,
      })
      .from(swaps)
      .where(and(eq(swaps.status, "completed"), sql`${swaps.operatorMinutes} > 0`)),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select party_id from (
          select party_a_id as party_id from swaps where accepted_at is not null
          union all
          select party_b_id as party_id from swaps where accepted_at is not null
        ) agreed
        group by party_id
        having count(*) > 1
      ) repeaters
    `),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from swaps s
      where s.status = 'completed'
        and not exists (
          select 1 from commitments c where c.swap_id = s.id and c.status = 'missed'
        )
    `),
    // From the answers themselves, not the current status. Status drops a
    // countered swap from both sides of the ratio even though the partner did
    // answer, and loses an accepted swap that was later cancelled.
    db.execute<{ answered: number; accepted: number }>(sql`
      select
        count(distinct swap_id)::int as answered,
        count(distinct swap_id) filter (where decision = 'accept')::int as accepted
      from responses
    `),
    db
      // bigint: int4 overflows at about 215 max-value rows and the exception
      // escapes pilotMetrics, taking the whole dashboard down with it.
      .select({ metric: results.metric, total: sql<number>`sum(${results.value})::bigint` })
      .from(results)
      .groupBy(results.metric),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(parties)
      .where(isNotNull(parties.listedAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(parties)
      .where(
        and(
          isNotNull(parties.listingRequestedAt),
          or(isNull(parties.listedAt), gt(parties.listingRequestedAt, parties.listedAt)),
        ),
      ),
    // One row per side of a live swap that has a deadline left and nobody to
    // send it to. Counted per side, not per commitment, because the fix is one
    // address either way.
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select distinct s.id, c.side
        from swaps s
        join commitments c on c.swap_id = s.id
        join parties p on p.id = case when c.side = 'a' then s.party_a_id else s.party_b_id end
        where s.status = 'accepted' and c.status = 'pending' and p.email is null
      ) sides
    `),
  ]);

  const swapsByStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<SwapStatus, number>;
  for (const row of statusRows) swapsByStatus[row.status] = row.n;

  const kept = commitmentRows.find((r) => r.status === "kept")?.n ?? 0;
  const missed = commitmentRows.find((r) => r.status === "missed")?.n ?? 0;
  const checked = kept + missed;


  const rowsOf = <T,>(result: unknown): T[] =>
    Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []);
  const repeatRows = rowsOf<{ n: number }>(partyRows);
  const keptRows = rowsOf<{ n: number }>(fullyKeptRows);
  const answers = rowsOf<{ answered: number; accepted: number }>(answerRows)[0];
  const answered = Number(answers?.answered ?? 0);
  const accepted = Number(answers?.accepted ?? 0);

  return {
    swapsByStatus,
    completedThisWeek: weekRows[0]?.n ?? 0,
    onTimeRate: checked === 0 ? null : kept / checked,
    keptCommitments: kept,
    checkedCommitments: checked,
    onTimeCommitments: onTimeRows[0]?.n ?? 0,
    acceptanceRate: answered === 0 ? null : accepted / answered,
    minutesPerCompletedSwap: minutesRows[0]?.avg ?? null,
    swapsWithTimeLogged: minutesRows[0]?.logged ?? 0,
    repeatParties: Number(repeatRows[0]?.n ?? 0),
    swapsFullyKept: Number(keptRows[0]?.n ?? 0),
    completedSwaps: swapsByStatus.completed,
    resultTotals: Object.fromEntries(resultRows.map((r) => [r.metric, Number(r.total)])),
    listedParties: listedRows[0]?.n ?? 0,
    pendingListings: pendingRows[0]?.n ?? 0,
    unchaseableSides: Number(rowsOf<{ n: number }>(unchaseableRows)[0]?.n ?? 0),
  };
}
