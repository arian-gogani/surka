import type { Metadata } from "next";
import { DealSheet } from "@/components/deal-sheet";
import { Logo, Mark } from "@/components/logo";
import { contactEmail } from "@/lib/env";

/**
 * Only things the code does today.
 *
 * Three of these described work that does not exist: drafting copy and assets
 * (no such table, no such screen), a closing report (nothing sends one), and a
 * tracking link on every placement (only the operator can create one, so a
 * self-serve swap never gets one). A founder can check all three inside a
 * single swap and find them missing, which is worse than promising less, and
 * it was on the one page whose job is to make the thing look real.
 */
const STEPS = [
  {
    title: "Writes the deal sheet",
    body: "What each side gives, and by when, on one page. Your partner can accept, suggest changes, or decline without making an account.",
  },
  {
    title: "Holds the dates",
    body: "Each deadline sits on the deal sheet where both sides can see it, and neither side can quietly move it.",
  },
  {
    title: "Chases both sides",
    body: "Three days before each deadline, one day before, and once if it passes. While the pilot runs we do some of that chasing by hand.",
  },
  {
    title: "Checks that it happened",
    body: "Against the newsletter archive, the live listing, or a screenshot. Each side's delivery is checked, not assumed, and what gets checked becomes your record.",
  },
  {
    title: "Keeps the record",
    body: "Kept and missed commitments, visible on your listing. It is the one thing about you that you can't write yourself.",
  },
];

/** Canonical set explicitly: the landing page is one of only two indexable URLs. */
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  const contact = contactEmail();
  const mailto = contact
    ? `mailto:${contact}?subject=${encodeURIComponent("A swap I want to run")}`
    : null;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
        {mailto ? (
          // "Talk to us" gave no warning that activating it leaves the browser
          // for a mail client, which on a phone is a jarring context change.
          // The warning goes in the accessible name rather than the visible
          // text: putting the address on a public page just feeds scrapers,
          // and it is already in the href for anyone who wants it.
          <a
            href={mailto}
            aria-label="Talk to us by email (opens your mail app)"
            className="-mx-2 inline-flex min-h-11 items-center px-2 text-[0.9375rem] font-medium text-ink underline-offset-4 hover:underline"
          >
            Talk to us
          </a>
        ) : null}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-16">
          <div>
            <h1 className="max-w-[14ch] text-[44px] font-semibold leading-[1.02] sm:text-[60px]">
              Partner swaps that actually happen.
            </h1>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-muted">
              You and another founder agree to promote each other. Then the swap stalls: nobody owns the
              dates, nobody checks the other side shipped, and nobody follows up. Surka writes it down,
              holds both of you to the dates, and checks each part actually happened.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/start"
                className="inline-flex min-h-11 items-center rounded-md bg-spark px-5 text-[0.9375rem] font-medium text-ink hover:bg-[#ff6d4d]"
              >
                Start a swap
              </a>
              {/* The other half of the funnel. "Start a swap" assumes you
                  already have a partner, which most visitors do not, and until
                  this page existed they had nowhere to go. */}
              <a
                href="/partners"
                className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-white px-5 text-[0.9375rem] font-medium text-ink hover:border-ink"
              >
                Find a partner
              </a>
            </div>
            <p className="mt-4 text-[0.9375rem] text-muted">
              No account, for you or for them. <a href="#how" className="underline underline-offset-4">See how a swap runs</a>.
            </p>
          </div>

          <DealSheet
            caption="An example deal sheet"
            title="Newsletter feature for an extended trial"
            a={{
              name: "Clinic Scheduler",
              detail: "Shopify app for appointment booking",
              record: "Kept 2 of 2 commitments",
              gives: [{ description: "An extra free month for readers who sign up through the issue's link", dueDate: "2026-11-30" }],
            }}
            b={{
              name: "Practice Manager Weekly",
              detail: "Newsletter for clinic managers",
              record: "No swaps through Surka yet",
              gives: [{ description: "A dedicated section in the October 17 issue", dueDate: "2026-10-17" }],
            }}
          />
        </section>

        {/* tabIndex so the jump link actually moves focus here. Without it the
            next Tab went to the link after the hero, not into this section. */}
        <section id="how" tabIndex={-1} className="border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold sm:text-4xl">What Surka does after you say yes</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                Most swaps die for boring reasons. The terms are vague, nobody owns the timeline, nobody
                checks the other side shipped, and nobody follows up. Each step below removes one of those.
              </p>
            </div>
            <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative pl-12">
                  <span
                    aria-hidden="true"
                    className="num absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-line font-display text-sm font-semibold"
                  >
                    {i + 1}
                  </span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>

            {/*
              The question every sceptic has and no page answered. The product
              asks for a dated commitment from someone with no account, no
              contract and no money at stake, and repeated "we hold both sides
              to it" on four pages without once saying by what. Saying what the
              answer actually is beats letting them guess that there is one.
            */}
            <div className="mt-16 max-w-prose rounded-xl border border-line bg-white px-6 py-7">
              <h3 className="text-xl font-semibold">What if they just don&apos;t deliver?</h3>
              <p className="mt-3 leading-relaxed text-muted">
                Then nothing makes them. There is no contract here and no money held, and we would rather say
                that than let you find out. What there is: a deadline neither side can quietly move, a nudge
                before it and after it, and a check against real proof, so a miss is a miss on the record
                rather than an argument about what was agreed.
              </p>
              <p className="mt-3 leading-relaxed text-muted">
                That record is the only thing with teeth, and it is why the first swap is the one that costs
                you something. Start with a placement you would not mind losing, with someone whose record you
                can read.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold">Your record travels with you</h2>
            <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
              Every swap records whether each side delivered on time. That record shows on your next deal
              sheet, so bigger partners can see you keep your word. Old misses fade, and one bad swap
              won&apos;t follow you forever.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-semibold">Your numbers stay yours</h2>
            <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
              Installs and signups from a swap are shared only with the two sides. Reputation counts
              commitments kept, never results, because you control whether you deliver, not whether
              an audience clicks.
            </p>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <Mark size={44} className="mt-1 shrink-0" />
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl">Have a swap that stalled?</h2>
                <p className="mt-2 max-w-prose text-lg text-muted">
                  Send it to us. We&apos;ll run it from the terms to the results, and it&apos;s free while
                  we&apos;re starting out.
                </p>
              </div>
            </div>
            <a
              href="/start"
              className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-spark px-5 text-[0.9375rem] font-medium text-ink hover:bg-[#ff6d4d]"
            >
              Start a swap
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[0.875rem] text-muted sm:px-8">
          <Logo size={20} />
          <p>Every swap, both sides grow.</p>
        </div>
      </footer>
    </div>
  );
}
