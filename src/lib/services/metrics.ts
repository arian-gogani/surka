import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { commitments, results, swaps, type ResultMetric, type SwapStatus } from "@/db/schema";
import { DAY_MS } from "../dates";

export interface PilotMetrics {
  swapsByStatus: Record<SwapStatus, number>;
  completedThisWeek: number;
  /** Kept ÷ checked commitments. Null until something has been checked. */
  onTimeRate: number | null;
  keptCommitments: number;
  checkedCommitments: number;
  /** Accepted ÷ answered proposals. */
  acceptanceRate: number | null;
  /** Average operator minutes per completed swap. */
  minutesPerCompletedSwap: number | null;
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

  const [statusRows, weekRows, commitmentRows, minutesRows, partyRows, fullyKeptRows, resultRows] =
    await Promise.all([
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
    db
      .select({ avg: sql<number | null>`avg(${swaps.operatorMinutes})::float` })
      .from(swaps)
      .where(eq(swaps.status, "completed")),
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
    db
      // bigint: int4 overflows at about 215 max-value rows and the exception
      // escapes pilotMetrics, taking the whole dashboard down with it.
      .select({ metric: results.metric, total: sql<number>`sum(${results.value})::bigint` })
      .from(results)
      .groupBy(results.metric),
  ]);

  const swapsByStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<SwapStatus, number>;
  for (const row of statusRows) swapsByStatus[row.status] = row.n;

  const kept = commitmentRows.find((r) => r.status === "kept")?.n ?? 0;
  const missed = commitmentRows.find((r) => r.status === "missed")?.n ?? 0;
  const checked = kept + missed;

  const everAccepted = swapsByStatus.accepted + swapsByStatus.completed;
  const answered = everAccepted + swapsByStatus.declined;

  const repeatRows = Array.isArray(partyRows) ? partyRows : (partyRows as { rows: { n: number }[] }).rows;
  const keptRows = Array.isArray(fullyKeptRows)
    ? fullyKeptRows
    : (fullyKeptRows as { rows: { n: number }[] }).rows;

  return {
    swapsByStatus,
    completedThisWeek: weekRows[0]?.n ?? 0,
    onTimeRate: checked === 0 ? null : kept / checked,
    keptCommitments: kept,
    checkedCommitments: checked,
    acceptanceRate: answered === 0 ? null : everAccepted / answered,
    minutesPerCompletedSwap: minutesRows[0]?.avg ?? null,
    repeatParties: Number(repeatRows[0]?.n ?? 0),
    swapsFullyKept: Number(keptRows[0]?.n ?? 0),
    completedSwaps: swapsByStatus.completed,
    resultTotals: Object.fromEntries(resultRows.map((r) => [r.metric, Number(r.total)])),
  };
}
