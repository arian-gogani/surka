import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { DealSheet } from "@/components/deal-sheet";
import { Logo } from "@/components/logo";
import { Button, ButtonLink, CommitmentState, Field, Notice, SideTag, StatusPill } from "@/components/ui";
import { getDb } from "@/db/client";
import type { Commitment, Side } from "@/db/schema";
import { formatDate, relativeDue } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { SurkaError } from "@/lib/errors";
import { sheetSide } from "@/lib/present";
import { getSwapForToken, type SideView } from "@/lib/services/swaps";
import { otherSide } from "@/lib/swap-rules";
import { deliverAction, reportResultAction, respondAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your swap",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
};

export default async function SwapLinkPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error, ok } = await searchParams;

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
        <Logo size={26} />
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
            <Intro title="This proposal isn't ready yet" body="You'll get a link as soon as it is." />
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
            <Intro title={`Waiting on ${theirParty.name}`} body="We sent them the deal sheet. You'll hear from us when they answer.">
              {sheet}
            </Intro>
          )
        ) : null}

        {view.swap.status === "countered" ? (
          <Intro
            title="The terms are being reworked"
            body={
              me === "b"
                ? "Thanks for your suggestion. We'll send you a new version."
                : `${theirParty.name} suggested changes. We'll send them a new version once you've agreed to it.`
            }
          >
            {view.responses[0]?.message ? (
              <blockquote className="rounded-lg border border-line bg-white px-5 py-4 text-[15px] leading-relaxed">
                <p className="text-[13px] text-muted">What {view.partyB.name} suggested</p>
                <p className="mt-1 whitespace-pre-line">{view.responses[0].message}</p>
              </blockquote>
            ) : null}
            {sheet}
          </Intro>
        ) : null}

        {view.swap.status === "accepted" || view.swap.status === "completed" ? (
          <SwapRoom view={view} me={me} them={them} myName={myParty.name} theirName={theirParty.name} />
        ) : null}

        {view.swap.status === "declined" || view.swap.status === "cancelled" ? (
          <Intro title="This swap is closed" body="Nothing else is needed from you. Thanks for your time.">
            {sheet}
          </Intro>
        ) : null}

        <RunYourOwn token={view.token} />
      </main>
    </div>
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
      <ButtonLink href={`/start?from=${token}`} variant="action" className="mt-5">
        Start a swap
      </ButtonLink>
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
        <legend className="text-[15px] font-medium">What would you like to do?</legend>
        {DECISIONS.map((d) => (
          <label key={d.value} className="flex items-start gap-3 text-[15px]">
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
}: {
  view: SideView;
  me: Side;
  them: Side;
  myName: string;
  theirName: string;
}) {
  const now = new Date();
  const mine = view.commitments.filter((c) => c.side === me);
  const theirs = view.commitments.filter((c) => c.side === them);
  const myLinks = view.trackingLinks.filter((l) => l.side === me);
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

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-xl font-semibold">
          What you give
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {mine.map((c) => (
            <CommitmentRow key={c.id} c={c} now={now}>
              {c.status === "pending" && !done ? <DeliverForm token={view.token} commitmentId={c.id} /> : null}
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
            <CommitmentRow key={c.id} c={c} now={now} />
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
                  <span className="num text-[13px] text-muted">
                    {l.clicks} {l.clicks === 1 ? "click" : "clicks"}
                  </span>
                </div>
                {/* Labelled per placement: every tracking link produced a button
                    called "Copy link", so a screen reader's button list showed N
                    identical entries pointing at different URLs. */}
                <CopyLink url={`${appUrl()}/r/${l.code}`} label={`Copy link for ${l.label}`} />
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
            <p className="mt-4 text-[15px] text-muted">No results reported yet. Add yours once the placement has run.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {view.results.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-4 border-b border-line pb-2 text-[15px]">
                  <SideTag name={r.side === me ? myName : theirName} side={r.side} />
                  <span className="num font-medium">
                    {r.value.toLocaleString("en-US")} {r.metric}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form action={reportResultAction} className="space-y-4 rounded-xl border border-line bg-white p-5">
          <h3 className="font-semibold">Report what you got from it</h3>
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

function CommitmentRow({ c, now, children }: { c: Commitment; now: Date; children?: React.ReactNode }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <p className="max-w-prose text-[15px] leading-snug">{c.description}</p>
        <CommitmentState status={c.status} />
      </div>
      <p className="num mt-1 text-[13px] text-muted">
        Due {formatDate(c.dueDate)}
        {c.status === "pending" ? ` (${relativeDue(c.dueDate, now)})` : ""}
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

function DeliverForm({ token, commitmentId }: { token: string; commitmentId: string }) {
  const id = `proof-${commitmentId}`;
  return (
    <form action={deliverAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="commitmentId" value={commitmentId} />
      <label htmlFor={id} className="sr-only">
        Link that shows it&apos;s done
      </label>
      <input
        id={id}
        name="proofUrl"
        type="url"
        required
        placeholder="Link that shows it's done, like the archive page"
        className="field"
      />
      <Button type="submit" variant="action" className="shrink-0">
        Mark delivered
      </Button>
    </form>
  );
}
