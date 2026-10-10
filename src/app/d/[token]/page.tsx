import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { DealSheet } from "@/components/deal-sheet";
import { Logo } from "@/components/logo";
import { Button, ButtonLink, CommitmentState, Field, Notice, SideTag, StatusPill } from "@/components/ui";
import { getDb } from "@/db/client";
import type { Commitment, Side } from "@/db/schema";
import { formatDate, formatShortDate, relativeDue } from "@/lib/dates";
import { appUrl, contactEmail } from "@/lib/env";
import { SurkaError } from "@/lib/errors";
import { verifyNotice } from "@/lib/notice";
import { sheetSide } from "@/lib/present";
import { getSwapForToken, type SideView } from "@/lib/services/swaps";
import { otherSide } from "@/lib/swap-rules";
import {
  claimListingAction,
  confirmAction,
  deliverAction,
  reportResultAction,
  respondAction,
  setEmailAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your swap",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; ok?: string; s?: string }>;
};

export default async function SwapLinkPage({ params, searchParams }: Props) {
  const { token } = await params;
  const query = await searchParams;
  // Only this deployment's own words. Anything else in these parameters is
  // dropped: in the normal flow the proposer holds the partner's link, so they
  // could hand over a URL carrying whatever first-party-looking copy they
  // liked, on a page the reader has no other way to judge.
  const [error, ok] = await Promise.all([
    verifyNotice(query.error, query.s),
    verifyNotice(query.ok, query.s),
  ]);

  let view: SideView;
  try {
    view = await getSwapForToken(await getDb(), token);
  } catch (e) {
    if (e instanceof SurkaError && e.code === "not_found") notFound();
    throw e;
  }

  const me = view.side;
  const them = otherSide(me);
  const myParty = me === "a" ? view.partyA : view.partyB;
  const theirParty = me === "a" ? view.partyB : view.partyA;
  /**
   * The partner's link, shown back to the proposer only when the proposer is
   * the one who has to send it.
   *
   * /start shows it once on the sent page and nowhere else, so closing that
   * tab lost it forever: the proposer then sat on a page that said the deal
   * sheet had been sent, waiting for an answer that could never come.
   *
   * Gated on openedBy, because the link is also what proves the partner is the
   * partner. When an operator opened the swap they hand it over themselves,
   * and showing it to the proposer there would let them accept their own
   * proposal on the partner's behalf.
   */
  const partnerLinkToSend =
    me === "a" && view.swap.openedBy === "proposer" && view.swap.status !== "cancelled"
      ? (view.access.find((a) => a.side === "b")?.token ?? null)
      : null;
  const unanswered = view.swap.status === "draft" || view.swap.status === "proposed";
  const contact = contactEmail();
  const sheet = (
    <DealSheet
      title={view.swap.title}
      a={sheetSide(view.partyA, "a", view.commitments, view.records.a)}
      b={sheetSide(view.partyB, "b", view.commitments, view.records.b)}
      viewer={me}
    />
  );

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5 sm:px-8">
        {/* A link, like the one on every other page. Someone who arrived here
            from a stranger's email has no other way to find out what Surka is
            before deciding whether to agree to anything. */}
        <a href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-spark-deep">
          <Logo size={26} />
        </a>
        <StatusPill status={view.swap.status} />
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-5 pb-20 sm:px-8">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {ok ? <Notice tone="ok">{ok}</Notice> : null}

        {view.swap.status === "draft" ? (
          me === "a" ? (
            <Intro title="Draft" body={`Surka hasn't sent this to ${theirParty.name} yet. Check the terms below.`}>
              {sheet}
            </Intro>
          ) : (
            <Intro
              title="This proposal isn't ready yet"
              body="Keep this link. The terms are still being written, and this page will show them as soon as they are."
            />
          )
        ) : null}

        {view.swap.status === "proposed" ? (
          me === "b" ? (
            <Intro
              title={`${theirParty.name} wants to swap with you`}
              body="Here's what each side gives and by when. Accept it, suggest changes, or decline. No account needed."
            >
              {sheet}
              <RespondForm token={view.token} />
            </Intro>
          ) : (
            <Intro
              title={`Waiting on ${theirParty.name}`}
              body={
                partnerLinkToSend
                  ? "Send them the link below. Nothing happens until they open it."
                  : "They have the deal sheet. You'll hear from us when they answer."
              }
            >
              {sheet}
            </Intro>
          )
        ) : null}

        {view.swap.status === "countered" ? (
          <Intro
            title="The terms are being reworked"
            body={
              me === "b"
                ? "Thanks. Keep this link: the reworked terms appear on this page, and you answer them here."
                : `${theirParty.name} suggested changes. We'll send them a new version once you've agreed to it.`
            }
          >
            {view.responses[0]?.message ? (
              <blockquote className="rounded-lg border border-line bg-white px-5 py-4 text-[0.9375rem] leading-relaxed">
                {/* Always the partner's words, so on the partner's own screen
                    this read "What <your own company> suggested". */}
                <p className="text-[0.8125rem] text-muted">
                  {me === "b" ? "What you suggested" : `What ${view.partyB.name} suggested`}
                </p>
                <p className="mt-1 whitespace-pre-line">{view.responses[0].message}</p>
              </blockquote>
            ) : null}
            {sheet}
          </Intro>
        ) : null}

        {view.swap.status === "accepted" || view.swap.status === "completed" ? (
          <SwapRoom
            view={view}
            me={me}
            them={them}
            myName={myParty.name}
            theirName={theirParty.name}
            myEmail={myParty.email}
          />
        ) : null}

        {view.swap.status === "declined" || view.swap.status === "cancelled" ? (
          <Intro
            title="This swap is closed"
            body={
              view.swap.status === "declined" && me === "a"
                ? `${theirParty.name} declined this one. Nothing else is needed from you.`
                : "Nothing else is needed from you. Thanks for your time."
            }
          >
            {/* The partner's own words, which used to be collected, stored and
                never shown. Declining with a "but how about November" in the
                box is the most common real answer, and it was being dropped. */}
            {view.swap.status === "declined" && view.responses[0]?.message ? (
              <blockquote className="rounded-lg border border-line bg-white px-5 py-4 text-[0.9375rem] leading-relaxed">
                <p className="text-[0.8125rem] text-muted">
                  {me === "b" ? "What you said" : `What ${view.partyB.name} said`}
                </p>
                <p className="mt-1 whitespace-pre-line">{view.responses[0].message}</p>
              </blockquote>
            ) : null}
            {sheet}
          </Intro>
        ) : null}

        {partnerLinkToSend && unanswered ? <SendToPartner name={theirParty.name} token={partnerLinkToSend} /> : null}

        <RunYourOwn token={view.token} />

        {/* Every refusal on this page used to end the road: a checked
            commitment, an expired proposal, a race with the other side. There
            was no address anywhere on it, and the logo was not a link. */}
        <footer className="border-t border-line pt-6 text-[0.875rem] text-muted">
          <p>
            {contact ? (
              <>
                Something wrong with this swap?{" "}
                <a
                  href={`mailto:${contact}?subject=${encodeURIComponent(`Swap: ${view.swap.title}`)}`}
                  className="-mx-1 inline-flex min-h-11 items-center px-1 font-medium text-ink underline underline-offset-4"
                >
                  Email us
                </a>{" "}
                and we&apos;ll sort it out.{" "}
              </>
            ) : null}
            Keep this link: it is the only way back to this page.
          </p>
        </footer>
      </main>
    </div>
  );
}

/**
 * The proposer's copy of the partner's link.
 *
 * Nothing is emailed when a swap is opened from the public form, so until this
 * link reaches the partner the swap does not exist as far as they know.
 */
function SendToPartner({ name, token }: { name: string; token: string }) {
  return (
    <aside className="rounded-xl border border-spark/40 bg-white px-6 py-6">
      <h2 className="text-xl font-semibold">Send this link to {name}</h2>
      <p className="mt-2 max-w-prose text-muted">
        It is the whole deal sheet, and it is how they accept, suggest changes, or decline. No account needed. Keep
        this page for when you need the link again.
      </p>
      <div className="mt-4">
        <CopyLink url={`${appUrl()}/d/${token}`} />
      </div>
    </aside>
  );
}

/**
 * The only way out of this page. Whoever is reading it has just watched the
 * product work on a swap of their own, without an account, which makes them the
 * best-qualified visitor the site gets. Until now it dead-ended here.
 */
function RunYourOwn({ token }: { token: string }) {
  return (
    <aside className="mt-14 rounded-xl border border-line bg-white px-6 py-7">
      <h2 className="text-xl font-semibold">Got a swap of your own in mind?</h2>
      <p className="mt-2 max-w-prose text-muted">
        Write down what each side gives and by when, and we&apos;ll hold both of you to it. No account, and
        your partner doesn&apos;t need one either. Your side carries over, so your record keeps building.
      </p>
      {/* The token proves which business this is, which is what lets the next
          swap reuse the same party instead of starting their record from zero. */}
      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink href={`/start?from=${token}`} variant="action">
          Start a swap
        </ButtonLink>
        <ButtonLink href="/partners">Find a partner</ButtonLink>
      </div>
    </aside>
  );
}

function Intro({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-prose text-lg text-muted">{body}</p>
      </div>
      {children}
    </section>
  );
}

function RespondForm({ token }: { token: string }) {
  return (
    <form action={respondAction} className="space-y-5 rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Your answer</h2>
      <Field label="Your email" hint="For dates and reminders about this swap. It isn't shared or used for anything else.">
        <input name="email" type="email" autoComplete="email" className="field max-w-md" />
      </Field>
      <Field label="Anything you'd change?" hint="Needed if you suggest changes. Optional otherwise.">
        <textarea name="message" rows={3} className="field" />
      </Field>
      {/*
        Three submit buttons sharing a name would make the first one the form's
        default, so pressing Enter in the email field silently submitted
        "accept". Accepting is irreversible, and a keyboard or screen reader
        user would never have seen it happen. A radio group makes the choice
        explicit, and implicit submission now triggers validation instead.
      */}
      <fieldset className="space-y-3">
        <legend className="text-[0.9375rem] font-medium">What would you like to do?</legend>
        {DECISIONS.map((d) => (
          <label key={d.value} className="flex items-start gap-3 text-[0.9375rem]">
            <input type="radio" name="decision" value={d.value} required className="mt-1" />
            <span>
              <span className="font-medium">{d.label}</span>
              <span className="block text-muted">{d.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="action">
        Send answer
      </Button>
      <input type="hidden" name="token" value={token} />
    </form>
  );
}

/**
 * The way onto the partner list from a swap.
 *
 * A button, not a form. Listing is a claim about the business, and the link
 * this page was opened with is shared with the counterparty on purpose, so it
 * cannot be the proof. This mints a link that is and sends them there.
 */
function ClaimListing({ token, name }: { token: string; name: string }) {
  return (
    <form action={claimListingAction} className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Want partners to find you?</h2>
      <p className="mt-2 max-w-prose text-muted">
        Say what {name} can offer and what you&apos;re after, and founders can propose swaps to you without an
        introduction. Your record of kept commitments shows next to your name. No email or contact details are
        ever shown.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="action">
          Set up your listing
        </Button>
        <a href="/partners" className="text-[0.9375rem] text-muted underline underline-offset-4">
          See the list
        </a>
      </div>
      <input type="hidden" name="token" value={token} />
    </form>
  );
}

/**
 * Offered to whichever side has no address on file, which is the proposer on
 * every swap (nothing ever asks them) and the partner whenever they left the
 * field blank. Without an address this swap runs to its deadlines in silence.
 */
function ReminderForm({ token }: { token: string }) {
  return (
    <form action={setEmailAction} className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Want reminders?</h2>
      <p className="mt-2 max-w-prose text-muted">
        We&apos;ll email you before each deadline on this swap, and once if one passes. Nothing else, and it
        isn&apos;t shared.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Your email">
          <input name="email" type="email" required autoComplete="email" className="field max-w-xs" />
        </Field>
        <Button type="submit">Remind me</Button>
      </div>
      <input type="hidden" name="token" value={token} />
    </form>
  );
}

const DECISIONS = [
  { value: "accept", label: "Accept the swap", hint: "Both sides are held to the dates above." },
  { value: "counter", label: "Suggest changes", hint: "Say what you'd change and it goes back for a rework." },
  { value: "decline", label: "Decline", hint: "Nothing else is needed from you." },
] as const;

function SwapRoom({
  view,
  me,
  them,
  myName,
  theirName,
  myEmail,
}: {
  view: SideView;
  me: Side;
  them: Side;
  myName: string;
  theirName: string;
  myEmail: string | null;
}) {
  const now = new Date();
  const mine = view.commitments.filter((c) => c.side === me);
  const theirs = view.commitments.filter((c) => c.side === them);
  // Already only this side's own links, and only their labels and counts for
  // the other side's. The split happens in the service because everything in
  // `view` is serialised into this document whether or not it is rendered.
  const myLinks = view.trackingLinks;
  const done = view.swap.status === "completed";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold sm:text-4xl">{view.swap.title}</h1>
        <p className="mt-3 max-w-prose text-lg text-muted">
          {done
            ? "This swap is complete. Here's how both sides did."
            : `You and ${theirName} have agreed. Deliver your part by the dates below, and mark it delivered with a link that shows it.`}
        </p>
      </div>

      {!myEmail && !done ? <ReminderForm token={view.token} /> : null}

      <ClaimListing token={view.token} name={myName} />

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-xl font-semibold">
          What you give
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {mine.map((c) => (
            <CommitmentRow key={c.id} c={c} now={now}>
              {c.status === "pending" || c.status === "delivered" ? (
                // Delivered rows keep the form so a mistyped proof link can be
                // replaced before anyone reads it.
                <DeliverForm token={view.token} commitmentId={c.id} replacing={c.status === "delivered"} />
              ) : null}
              {c.status === "missed" ? (
                // A miss is a human judgement from a proof link, and it goes
                // into this side's record. Without this there was no form, no
                // appeal, and no address anywhere on the page.
                <MissedNote description={c.description} />
              ) : null}
            </CommitmentRow>
          ))}
        </ul>
      </section>

      <section aria-labelledby="theirs">
        <h2 id="theirs" className="mb-3 text-xl font-semibold">
          What {theirName} gives
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {theirs.map((c) => (
            <CommitmentRow key={c.id} c={c} now={now}>
              {/* The one party who actually knows whether this ran. The
                  delivering side writes its own proof link, so until now
                  nobody asked the side it was owed to. */}
              {c.status === "delivered" ? <ConfirmForm token={view.token} commitmentId={c.id} /> : null}
            </CommitmentRow>
          ))}
        </ul>
      </section>

      {myLinks.length > 0 ? (
        <section aria-labelledby="links">
          <h2 id="links" className="text-xl font-semibold">
            Links for your placement
          </h2>
          <p className="mt-1 text-muted">Use these exact links when you feature {theirName}, so both sides can see what the swap produced.</p>
          <ul className="mt-4 space-y-3">
            {myLinks.map((l) => (
              <li key={l.code} className="rounded-xl border border-line bg-white p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{l.label}</span>
                  <span className="num text-[0.8125rem] text-muted">
                    {l.clicks} {l.clicks === 1 ? "click" : "clicks"}
                  </span>
                </div>
                {l.retiredAt ? (
                  // Retired links keep their row and lose their button. The
                  // clicks are part of this swap's history, but handing back a
                  // copy affordance for a URL that now 404s would get a dead
                  // link published in the next issue.
                  <p className="text-[0.875rem] text-muted">
                    This one has been retired and no longer works. Ask us for a replacement if the placement is
                    still running.
                  </p>
                ) : (
                  /* Labelled per placement: every tracking link produced a button
                     called "Copy link", so a screen reader's button list showed N
                     identical entries pointing at different URLs. */
                  <CopyLink url={`${appUrl()}/r/${l.code}`} label={`Copy link for ${l.label}`} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        The traffic this side received, which is the other half of the sum the
        results form below asks for. Each side could see only the links it
        placed, so a founder reporting 40 signups had no way to tell whether
        that came off 60 clicks or 6,000, on a page that tells them these links
        exist so both sides can see what the swap produced.

        Labels and counts, with no code and nothing to copy. A code is the other
        side's to publish: whoever holds it can send their own readers through
        it, and every one of those clicks would land in this side's column as
        traffic the other side sent them.
      */}
      {view.partnerPlacements.length > 0 ? (
        <section aria-labelledby="received">
          <h2 id="received" className="text-xl font-semibold">
            Clicks {theirName} sent you
          </h2>
          <p className="mt-1 text-muted">
            What {theirName}&apos;s placements drew, so you can weigh it against the results you report below.
          </p>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {view.partnerPlacements.map((p, i) => (
              // Retiring and recreating a placement is how a wrong link is
              // fixed, so two rows can honestly carry the same label.
              <li
                key={`${p.label}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-[0.9375rem]"
              >
                <span className="font-medium">{p.label}</span>
                <span className="num text-[0.8125rem] text-muted">
                  {p.clicks} {p.clicks === 1 ? "click" : "clicks"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="results" className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 id="results" className="text-xl font-semibold">
            Results
          </h2>
          <p className="mt-1 text-muted">Shared only between you and {theirName}.</p>
          {view.results.length === 0 ? (
            <p className="mt-4 text-[0.9375rem] text-muted">No results reported yet. Add yours once the placement has run.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {view.results.map((r) => (
                <li key={r.id} className="border-b border-line pb-2 text-[0.9375rem]">
                  <div className="flex items-baseline justify-between gap-4">
                    <SideTag name={r.side === me ? myName : theirName} side={r.side} />
                    <span className="num font-medium">
                      {r.value.toLocaleString("en-US")} {r.metric}
                    </span>
                  </div>
                  {/* As of when. Reporting the same measure again replaces the
                      figure in place with no visible change, so a number from
                      the first week read as current weeks later. */}
                  <p className="num mt-0.5 text-[0.8125rem] text-muted">
                    Reported {formatShortDate(r.createdAt)}
                  </p>
                  {/* The note was collected by the form below, stored, and shown
                      nowhere, so the one line explaining a surprising number
                      was invisible to the side reading it. */}
                  {r.note ? <p className="mt-1 text-[0.875rem] text-muted">{r.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <form action={reportResultAction} className="space-y-4 rounded-xl border border-line bg-white p-5">
          <h3 className="font-semibold">Report what you got from it</h3>
          <p className="text-[0.875rem] text-muted">
            Reporting the same measure again replaces the figure, so a wrong number is easy to fix.
          </p>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
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
              <input name="value" type="number" min={0} step={1} required inputMode="numeric" className="field num" />
            </Field>
          </div>
          <Field label="Note" hint="Optional, like the date range you counted.">
            <input name="note" className="field" />
          </Field>
          <Button type="submit">Save result</Button>
          <input type="hidden" name="token" value={view.token} />
        </form>
      </section>
    </div>
  );
}

/** A miss is a judgement call that lands in this side's record, so say how to appeal it. */
function MissedNote({ description }: { description: string }) {
  const contact = contactEmail();
  return (
    <p className="mt-3 text-[0.875rem] text-muted">
      Checked as missed.{" "}
      {contact ? (
        <>
          If you did deliver this, or the link we read was the wrong one,{" "}
          <a
            href={`mailto:${contact}?subject=${encodeURIComponent(`Missed: ${description}`)}`}
            className="-mx-1 inline-flex min-h-11 items-center px-1 font-medium text-ink underline underline-offset-4"
          >
            email us
          </a>{" "}
          and we&apos;ll reopen the check.
        </>
      ) : (
        "If that was wrong, ask whoever set up this swap to reopen the check."
      )}
    </p>
  );
}

function ConfirmForm({ token, commitmentId }: { token: string; commitmentId: string }) {
  return (
    <div className="mt-3">
      <p className="text-[0.875rem] text-muted">Did this actually arrive?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {["arrived", "missing"].map((said) => (
          <form key={said} action={confirmAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="commitmentId" value={commitmentId} />
            <input type="hidden" name="said" value={said} />
            <Button type="submit" variant={said === "arrived" ? "kept" : "danger"}>
              {said === "arrived" ? "Yes, it arrived" : "No, I didn't see it"}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

function CommitmentRow({ c, now, children }: { c: Commitment; now: Date; children?: React.ReactNode }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <p className="max-w-prose text-[0.9375rem] leading-snug">{c.description}</p>
        <CommitmentState status={c.status} />
      </div>
      <p className="num mt-1 text-[0.8125rem] text-muted">
        Due {formatDate(c.dueDate)}
        {c.status === "pending" ? ` (${relativeDue(c.dueDate, now)})` : ""}
        {c.confirmedSaid ? (
        <p className="mt-1 text-[0.8125rem] text-muted">
          {c.confirmedSaid === "arrived"
            ? "Confirmed by the other side."
            : "The other side says they didn't see it. We're checking the proof."}
        </p>
      ) : null}
      {c.proofUrl ? (
          <>
            {", "}
            {/* Every proof link read just "proof", so a screen reader's links
                list showed identical entries pointing at different URLs. */}
            <a
              href={c.proofUrl}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={`Proof for ${c.description} (opens in a new tab)`}
              className="underline underline-offset-2"
            >
              proof
            </a>
          </>
        ) : null}
      </p>
      {children}
    </li>
  );
}

function DeliverForm({
  token,
  commitmentId,
  replacing,
}: {
  token: string;
  commitmentId: string;
  replacing: boolean;
}) {
  const id = `proof-${commitmentId}`;
  return (
    <form action={deliverAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="commitmentId" value={commitmentId} />
      <label htmlFor={id} className="sr-only">
        {replacing ? "Replace the link that shows it's done" : "Link that shows it's done"}
      </label>
      <input
        id={id}
        name="proofUrl"
        type="url"
        required
        placeholder={
          replacing ? "Paste a different link to replace the one above" : "Link that shows it's done, like the archive page"
        }
        className="field"
      />
      <Button type="submit" variant={replacing ? "quiet" : "action"} className="shrink-0">
        {replacing ? "Replace link" : "Mark delivered"}
      </Button>
    </form>
  );
}
