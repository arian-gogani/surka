import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { ButtonLink, Notice, StatusPill } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatShortDate, relativeDue } from "@/lib/dates";
import { pilotMetrics } from "@/lib/services/metrics";
import { listSwaps } from "@/lib/services/swaps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Swaps", robots: { index: false } };

function pct(value: number | null): string {
  return value === null ? "None yet" : `${Math.round(value * 100)}%`;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const db = await getDb();
  const [metrics, swaps] = await Promise.all([pilotMetrics(db), listSwaps(db)]);
  const now = new Date();
  const open = metrics.swapsByStatus.proposed + metrics.swapsByStatus.countered + metrics.swapsByStatus.accepted;

  const score = [
    {
      label: "Completed",
      value: String(metrics.swapsByStatus.completed),
      note: `${metrics.completedThisWeek} this week, ${open} open`,
    },
    {
      // The Phase 0 gate is written in whole swaps, so lead with that number.
      label: "Swaps fully delivered",
      value: `${metrics.swapsFullyKept} of ${metrics.completedSwaps}`,
      note: `${pct(metrics.onTimeRate)} of commitments kept (${metrics.keptCommitments} of ${metrics.checkedCommitments})`,
    },
    { label: "Partners who accept", value: pct(metrics.acceptanceRate), note: "Of proposals answered" },
    {
      label: "On the partner list",
      value: String(metrics.listedParties),
      note: "Businesses a stranger can propose to",
    },
    {
      label: "Your time per swap",
      value: metrics.minutesPerCompletedSwap === null ? "None yet" : `${Math.round(metrics.minutesPerCompletedSwap)} min`,
      note: "Average over completed swaps",
    },
    { label: "Back for another", value: String(metrics.repeatParties), note: "Businesses with 2+ agreed swaps" },
  ];

  // Chasing deadlines is the product, and both ways it can fail were visible
  // only in a cron response body nobody reads.
  const emailOff = !process.env.RESEND_API_KEY?.trim() || !process.env.EMAIL_FROM?.trim();

  return (
    <AdminShell error={error} ok={ok}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">Swaps</h1>
        <ButtonLink href="/admin/swaps/new" variant="action">
          New swap
        </ButtonLink>
      </div>

      {emailOff ? (
        <Notice tone="error">
          No reminder has been delivered: RESEND_API_KEY or EMAIL_FROM is missing. Nothing is lost, every due
          reminder stays due, and the daily run answers 503 until both are set. Until then the dates below are
          yours to chase by hand.
        </Notice>
      ) : metrics.unchaseableSides > 0 ? (
        <Notice tone="error">
          {metrics.unchaseableSides === 1
            ? "One side of a live swap has a deadline coming and no email on file, so nothing will chase it."
            : `${metrics.unchaseableSides} sides of live swaps have deadlines coming and no email on file, so nothing will chase them.`}{" "}
          Add an address on the business, or send them their swap link and let them add it themselves.
        </Notice>
      ) : null}

      <dl className="grid overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-2 lg:grid-cols-3">
        {score.map((s) => (
          <div key={s.label} className="border-b border-line p-5 last:border-b-0 sm:border-r lg:last:border-r-0">
            <dt className="text-[13px] text-muted">{s.label}</dt>
            <dd className="num mt-1 font-display text-2xl font-semibold">{s.value}</dd>
            <dd className="mt-1 text-[13px] text-muted">{s.note}</dd>
          </div>
        ))}
      </dl>

      {swaps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-semibold">Run your first swap</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">
            Add the two businesses, write down what each gives and by when, and send the partner their link.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <ButtonLink href="/admin/parties">Add businesses</ButtonLink>
            <ButtonLink href="/admin/swaps/new" variant="action">
              New swap
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-line text-[13px] text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Swap</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 font-medium">Next due</th>
                <th scope="col" className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {swaps.map(({ swap, partyAName, partyBName, nextDue, awaitingCheck }) => (
                <tr key={swap.id} className="hover:bg-paper/60">
                  <td className="px-5 py-4">
                    <Link href={`/admin/swaps/${swap.id}`} className="font-medium underline-offset-4 hover:underline">
                      {swap.title}
                    </Link>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {partyAName} and {partyBName}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={swap.status} />
                  </td>
                  <td className="px-5 py-4 text-[14px]">
                    {/* Checks first: a pending due date used to win, so the one
                        thing actually waiting on the operator was invisible. */}
                    {awaitingCheck > 0 ? (
                      <span className="font-medium text-spark-deep">
                        {awaitingCheck === 1 ? "1 delivery to check" : `${awaitingCheck} deliveries to check`}
                      </span>
                    ) : nextDue && swap.status === "accepted" ? (
                      <>
                        <span className="num">{relativeDue(nextDue.dueDate, now)}</span>
                        <p className="max-w-[28ch] truncate text-[13px] text-muted">
                          {nextDue.side === "a" ? partyAName : partyBName}: {nextDue.description}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted">Nothing due</span>
                    )}
                  </td>
                  <td className="num px-5 py-4 text-[14px] text-muted">{formatShortDate(swap.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
