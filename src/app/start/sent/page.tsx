import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { appUrl } from "@/lib/env";

/** A token is on this page, so keep it out of search engines and referrers. */
export const metadata: Metadata = {
  title: "Your swap is ready",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SentPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  // b is absent when the proposal was aimed at a business on the partner list:
  // that side's token is theirs, not the proposer's, so it is never handed over.
  if (!a) notFound();

  const base = appUrl();
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-3xl px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <h1 className="text-[36px] font-semibold leading-[1.05] sm:text-[44px]">
          {b ? "Your deal sheet is ready." : "Your proposal is written down."}
        </h1>
        {/* Not "on its way". Nothing is emailed when a proposal is aimed at the
            partner list: the only mail this product sends is the deadline
            reminder, and that is off until a provider is configured. Saying it
            was sent would have been a claim about something the code does not
            do, to the people who got furthest through the funnel. */}
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          {b
            ? "Two links, and they are the only way into this swap. Save yours before you close this page."
            : "It is waiting on their own partner-list page. We don't email proposals yet, so we'll nudge them ourselves, and you'll see their answer on your link below. Save it before you close this page: it is the only way back in."}
        </p>

        {b ? (
          <section className="mt-10 rounded-xl border-2 border-spark bg-white p-5">
            <h2 className="text-lg font-semibold">Send this one to your partner</h2>
            <p className="mt-1 text-[15px] text-muted">
              They will see both sides of the trade and can accept, suggest changes, or decline. No account needed.
            </p>
            <div className="mt-4">
              <CopyLink url={`${base}/d/${b}`} label="Copy partner link" />
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold">This one is yours</h2>
          <p className="mt-1 text-[15px] text-muted">
            Mark your side delivered here, with a link that proves it, and watch their answer come in.
          </p>
          <div className="mt-4">
            <CopyLink url={`${base}/d/${a}`} label="Copy your link" />
          </div>
          <ButtonLink href={`/d/${a}`} variant="action" className="mt-5">
            Open your deal sheet
          </ButtonLink>
        </section>

        <p className="mt-8 max-w-prose text-[15px] text-muted">
          {b ? "Keep both links somewhere safe." : "Keep your link somewhere safe."} Anyone holding a link can act
          as that side of the swap, so treat {b ? "them" : "it"} the way you would a shared document link.
        </p>
      </main>
    </div>
  );
}
