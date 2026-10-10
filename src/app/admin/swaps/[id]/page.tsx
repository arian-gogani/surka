import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { CopyLink } from "@/components/copy-link";
import { TermsFields } from "@/components/terms-fields";
import { Button, CommitmentState, Field, SideTag, StatusPill } from "@/components/ui";
import { getDb } from "@/db/client";
import type { Side } from "@/db/schema";
import { daysUntil, formatDate, formatShortDate, relativeDue, toDateOnly } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { EVENT_LABEL, type SwapEventType } from "@/lib/events";
import { SurkaError } from "@/lib/errors";
import { getSwapDetail, type SwapDetail } from "@/lib/services/swaps";
import { possessive } from "@/lib/present";
import { canTransition, isFinal, isResolved, otherSide, termsEditable } from "@/lib/swap-rules";
import {
  addLinkAction,
  addResultAction,
  cancelSwapAction,
  logMinutesAction,
  markProposedAction,
  replaceTermsAction,
  retireLinkAction,
  verifyAction,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Swap", robots: { index: false } };


const STAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export default async function SwapAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let d: SwapDetail;
  try {
    d = await getSwapDetail(await getDb(), id);
  } catch (e) {
    if (e instanceof SurkaError && e.code === "not_found") notFound();
    throw e;
  }

  const name = (side: Side) => (side === "a" ? d.partyA.name : d.partyB.name);
  const link = (side: Side) => {
    const access = d.access.find((x) => x.side === side);
    return access ? { url: `${appUrl()}/d/${access.token}`, viewed: access.lastViewedAt } : null;
  };
  const now = new Date();
  const status = d.swap.status;
  const lastCounter = d.responses.find((r) => r.decision === "counter");

  return (
    <AdminShell error={error} ok={ok}>
      <Link href="/admin" className="text-[0.9375rem] text-muted underline-offset-4 hover:underline">
        All swaps
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{d.swap.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            <SideTag name={d.partyA.name} side="a" />
            <SideTag name={d.partyB.name} side="b" />
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <NextStep detail={d} lastCounter={lastCounter?.message ?? null} />

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Private links">
        {(["b", "a"] as const).map((side) => {
          const l = link(side);
          if (!l) return null;
          return (
            <div key={side} className="rounded-xl border border-line bg-white p-5">
              <p className="font-medium">
                {side === "b" ? `${possessive(d.partyB.name)} link (send this to the partner)` : `${possessive(d.partyA.name)} link`}
              </p>
              <p className="mb-3 mt-0.5 text-[0.8125rem] text-muted">
                {l.viewed ? `Last opened ${STAMP.format(l.viewed)}` : "Not opened yet"}
              </p>
              <CopyLink url={l.url} />
            </div>
          );
        })}
      </section>

      <section aria-labelledby="terms" className="space-y-3">
        <h2 id="terms" className="text-xl font-semibold">
          Terms
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {d.commitments.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0 max-w-prose">
                <SideTag name={name(c.side)} side={c.side} />
                <p className="mt-1 text-[0.9375rem]">{c.description}</p>
                <p className="num mt-0.5 text-[0.8125rem] text-muted">
                  Due {formatDate(c.dueDate)}
                  {c.status === "pending" && status === "accepted" ? ` (${relativeDue(c.dueDate, now)})` : ""}
                  {c.proofUrl ? (
                    <>
                      {", "}
                      <a href={c.proofUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        check the proof
                      </a>
                    </>
                  ) : null}
                </p>
                {/* The one fact the Kept decision turns on, and it was not on
                    this screen. deliveredAt was stored and compared to
                    nothing, so the operator had to read the timeline to learn
                    a delivery landed three months late. */}
                {c.withdrawnAt ? (
                  <p className="mt-1 text-[0.8125rem] font-medium text-spark-deep">
                    {name(c.side)} called this off {formatShortDate(c.withdrawnAt)}.
                    {c.withdrawnNote ? ` "${c.withdrawnNote}"` : ""} Reminders have stopped.
                  </p>
                ) : null}
                {c.confirmedSaid ? (
                  <p
                    className={`mt-1 text-[0.8125rem] font-medium ${
                      c.confirmedSaid === "arrived" ? "text-kept-deep" : "text-spark-deep"
                    }`}
                  >
                    {c.confirmedSaid === "arrived"
                      ? `${name(otherSide(c.side))} confirms it arrived.`
                      : `${name(otherSide(c.side))} says they never saw it. Read the proof before marking this kept.`}
                  </p>
                ) : c.status === "delivered" ? (
                  <p className="mt-1 text-[0.8125rem] text-muted">
                    {name(otherSide(c.side))} hasn&apos;t said whether it arrived yet.
                  </p>
                ) : null}
                {c.deliveredAt ? (
                  <p className="num mt-0.5 text-[0.8125rem] text-muted">
                    Delivered {formatShortDate(c.deliveredAt)}
                    {daysUntil(c.dueDate, c.deliveredAt) < 0
                      ? `, ${Math.abs(daysUntil(c.dueDate, c.deliveredAt))} day(s) late`
                      : ", on time"}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <CommitmentState status={c.status} />
                {status === "accepted" && (c.status === "pending" || c.status === "delivered") ? (
                  <form action={verifyAction} className="flex gap-2">
                    <input type="hidden" name="swapId" value={d.swap.id} />
                    <input type="hidden" name="commitmentId" value={c.id} />
                    <Button type="submit" name="outcome" value="kept" variant="kept" className="min-h-9 px-3 text-sm">
                      Kept
                    </Button>
                    <Button type="submit" name="outcome" value="missed" variant="danger" className="min-h-9 px-3 text-sm">
                      Missed
                    </Button>
                    {c.status === "delivered" ? (
                      <Button type="submit" name="outcome" value="pending" className="min-h-9 px-3 text-sm">
                        Reopen
                      </Button>
                    ) : null}
                  </form>
                ) : null}
                {/* A check is a human judgement and Kept sits beside Missed, so
                    it has to be undoable. Reopening a completed swap's last
                    commitment pulls the swap back to accepted. */}
                {isResolved(c.status) && (status === "accepted" || status === "completed") ? (
                  <form action={verifyAction}>
                    <input type="hidden" name="swapId" value={d.swap.id} />
                    <input type="hidden" name="commitmentId" value={c.id} />
                    <input type="hidden" name="outcome" value="pending" />
                    <Button type="submit" className="min-h-9 px-3 text-sm">
                      Reopen this check
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {termsEditable(status) ? (
          // Open on a counter: the banner's only button re-sends, and sending
          // moves countered to proposed, so a collapsed rework form was one
          // click away from the partner receiving the identical deal sheet.
          <details open={status === "countered"} className="rounded-xl border border-line bg-white p-5">
            <summary className="cursor-pointer font-medium">Rework the terms</summary>
            <form action={replaceTermsAction} className="mt-4 space-y-4">
              <TermsFields
                today={toDateOnly(new Date())}
                names={{ a: d.partyA.name, b: d.partyB.name }}
                rows={d.commitments.map((c) => ({ side: c.side, description: c.description, dueDate: c.dueDate }))}
              />
              <Button type="submit">Save terms</Button>
              <input type="hidden" name="swapId" value={d.swap.id} />
            </form>
          </details>
        ) : null}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="tracking" className="space-y-3">
          <h2 id="tracking" className="text-xl font-semibold">
            Tracking links
          </h2>
          {d.trackingLinks.length === 0 ? (
            <p className="text-[0.9375rem] text-muted">
              Create one for each placement, so both sides can see what it produced.
            </p>
          ) : (
            <ul className="space-y-3">
              {d.trackingLinks.map((l) => (
                <li key={l.code} className="rounded-xl border border-line bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[0.9375rem]">
                      <span className="font-medium">{l.label}</span>
                      <span className="text-muted"> in {possessive(name(l.side))} channel</span>
                    </span>
                    <span className="num text-[0.8125rem] text-muted">
                      {l.clicks} {l.clicks === 1 ? "click" : "clicks"}
                    </span>
                  </div>
                  {l.retiredAt ? (
                    // No copy button on a dead code. The only reason to copy
                    // one is to publish it, and this one 404s now. The count
                    // stays: those visits happened, and both sides read it.
                    <p className="text-[0.8125rem] text-muted">
                      Retired {STAMP.format(l.retiredAt)}. It doesn&apos;t redirect anymore.
                    </p>
                  ) : (
                    <>
                      <CopyLink url={`${appUrl()}/r/${l.code}`} />
                      {/* Retire, not edit. This code is already printed in
                          somebody's newsletter, so repointing it would change
                          what a reader was promised after they read it. */}
                      <form action={retireLinkAction} className="mt-3">
                        <input type="hidden" name="swapId" value={d.swap.id} />
                        <input type="hidden" name="code" value={l.code} />
                        <Button type="submit" variant="danger" className="min-h-9 px-3 text-sm">
                          Retire this link
                        </Button>
                      </form>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isFinal(status) ? (
            <form action={addLinkAction} className="space-y-3 rounded-xl border border-line bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Placed by">
                  <select name="side" className="field" defaultValue="b">
                    <option value="a">{d.partyA.name}</option>
                    <option value="b">{d.partyB.name}</option>
                  </select>
                </Field>
                <Field label="Placement">
                  <input name="label" required placeholder="Oct 17 issue" className="field" />
                </Field>
              </div>
              <Field label="Sends visitors to">
                <input name="destinationUrl" type="url" required placeholder="https://" className="field" />
              </Field>
              <Button type="submit">Create link</Button>
              <input type="hidden" name="swapId" value={d.swap.id} />
            </form>
          ) : null}
        </section>

        <section aria-labelledby="results" className="space-y-3">
          <h2 id="results" className="text-xl font-semibold">
            Results
          </h2>
          {d.results.length === 0 ? (
            <p className="text-[0.9375rem] text-muted">Nothing reported yet. Either side can report from their link.</p>
          ) : (
            <ul className="space-y-2">
              {d.results.map((r) => (
                <li key={r.id} className="border-b border-line pb-2 text-[0.9375rem]">
                  <div className="flex items-baseline justify-between gap-4">
                    <SideTag name={name(r.side)} side={r.side} />
                    <span className="num font-medium">
                      {r.value.toLocaleString("en-US")} {r.metric}
                    </span>
                  </div>
                  {/* Both of these were stored and rendered only on the deal
                      sheet, so the operator saw a bare number with no date and
                      no explanation. */}
                  <p className="num mt-0.5 text-[0.8125rem] text-muted">Reported {STAMP.format(r.createdAt)}</p>
                  {r.note ? <p className="mt-0.5 text-[0.875rem] text-muted">{r.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <form action={addResultAction} className="space-y-3 rounded-xl border border-line bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Growth for">
                <select name="side" className="field" defaultValue="a">
                  <option value="a">{d.partyA.name}</option>
                  <option value="b">{d.partyB.name}</option>
                </select>
              </Field>
              <Field label="Measure">
                <select name="metric" className="field" defaultValue="installs">
                  <option value="installs">Installs</option>
                  <option value="signups">Signups</option>
                  <option value="trials">Trials</option>
                  <option value="clicks">Clicks</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Number">
                <input name="value" type="number" min={0} step={1} required className="field num" />
              </Field>
            </div>
            <Field label="Note">
              <input name="note" className="field" />
            </Field>
            <Button type="submit">Save result</Button>
            <input type="hidden" name="swapId" value={d.swap.id} />
          </form>
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="time" className="space-y-3">
          <h2 id="time" className="text-xl font-semibold">
            Your time
          </h2>
          <p className="text-[0.9375rem] text-muted">
            <span className="num font-medium text-ink">{d.swap.operatorMinutes} minutes</span> logged on this swap. The
            steps that take longest are the ones to automate first.
          </p>
          <form action={logMinutesAction} className="flex items-end gap-3">
            <input type="hidden" name="swapId" value={d.swap.id} />
            <Field label="Minutes spent just now" className="w-48">
              <input name="minutes" type="number" min={1} max={600} step={1} required className="field num" />
            </Field>
            <Button type="submit">Log time</Button>
          </form>
        </section>

        <section aria-labelledby="timeline" className="space-y-3">
          <h2 id="timeline" className="text-xl font-semibold">
            Timeline
          </h2>
          <ol className="space-y-2.5">
            {d.events.map((e) => (
              <li key={e.id} className="grid grid-cols-[9.5rem_1fr] gap-3 text-[0.875rem]">
                <span className="num text-muted">{STAMP.format(e.createdAt)}</span>
                <span>
                  {e.side ? <span className="font-medium">{name(e.side)}: </span> : null}
                  {EVENT_LABEL[e.type as SwapEventType] ?? e.type}
                  {e.detail ? <span className="text-muted"> ({e.detail})</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Not !isFinal: completed can now move to accepted, which made that
          check true and offered a cancel that always failed. */}
      {canTransition(status, "cancelled") ? (
        <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="cancel">
          <h2 id="cancel" className="font-semibold">
            Cancel this swap
          </h2>
          <form action={cancelSwapAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="swapId" value={d.swap.id} />
            <Field label="Reason" className="flex-1">
              <input name="reason" placeholder="Optional, for your records" className="field" />
            </Field>
            <Button type="submit" variant="danger">
              Cancel swap
            </Button>
          </form>
        </section>
      ) : null}
    </AdminShell>
  );
}

function NextStep({ detail, lastCounter }: { detail: SwapDetail; lastCounter: string | null }) {
  const { swap, partyB } = detail;
  const markSent = (label: string) => (
    <form action={markProposedAction}>
      <input type="hidden" name="swapId" value={swap.id} />
      <Button type="submit" variant="action">
        {label}
      </Button>
    </form>
  );

  let body: React.ReactNode;
  switch (swap.status) {
    case "draft":
      body = (
        <>
          <p>Check the terms, send {partyB.name} their link below, then mark it as sent.</p>
          {markSent("Mark as sent")}
        </>
      );
      break;
    case "proposed":
      body = <p>Waiting on {partyB.name} to accept, suggest changes, or decline.</p>;
      break;
    case "countered":
      body = (
        <>
          <div>
            <p>{partyB.name} suggested changes. Rework the terms with the proposing side, then send the new version.</p>
            {lastCounter ? (
              <blockquote className="mt-2 whitespace-pre-line border-l-2 border-spark pl-3 text-muted">{lastCounter}</blockquote>
            ) : null}
          </div>
          {markSent("Mark new version as sent")}
        </>
      );
      break;
    case "accepted":
      body = <p>Both sides agreed. Check each commitment against its proof as it&apos;s delivered.</p>;
      break;
    case "completed":
      // Only a swap one person did not hold both links for feeds the record,
      // which is every operator-run swap and every directory proposal, but not
      // one somebody set up themselves from the public form.
      body = (
        <p>
          Completed. Every commitment has been checked.
          {detail.swap.openedBy === "proposer"
            ? " This one was set up by the proposer, so it does not count toward either side's public record."
            : " Both sides' records are updated."}
        </p>
      );
      break;
    default:
      body = <p>This swap is closed.</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink/15 bg-white px-5 py-4 text-[0.9375rem]">
      {body}
    </div>
  );
}
