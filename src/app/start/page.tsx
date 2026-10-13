import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { getDb } from "@/db/client";
import { addDays, toDateOnly } from "@/lib/dates";
import { getListing, partyForToken } from "@/lib/services/swaps";
import { StartForm } from "./start-form";

/**
 * Arriving from a deal sheet puts a private token in the query string, so that
 * variant is kept out of search engines. The bare page stays indexable because
 * it is the public way in. Referrers are suppressed either way, so a token can
 * never ride along to an external site.
 */
type Query = { from?: string; with?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Query>;
}): Promise<Metadata> {
  const { from, with: withId } = await searchParams;
  // The heading becomes "Propose a swap to X", so the title has to agree:
  // someone with several tabs open picks between them by title alone.
  const target = withId ? await getListing(await getDb(), withId) : null;
  return {
    title: target ? `Propose a swap to ${target.name}` : "Start a swap",
    description:
      "Write down what each side gives and by when. You get two private links: one for you, one to send your partner.",
    referrer: "no-referrer",
    alternates: { canonical: "/start" },
    ...(from ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function StartPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { from, with: withId } = await searchParams;
  // A deadline in the past is always a mis-click here, so the picker won't offer one.
  const today = toDateOnly(new Date());
  const inTwoWeeks = addDays(today, 14);
  const db = await getDb();
  // Arriving from an existing swap link: we already know who this side is, and
  // reusing that business is what lets their track record build up over swaps.
  // Arriving from a directory listing: we know who the partner is the same way.
  const [you, target] = await Promise.all([
    from ? partyForToken(db, from) : null,
    withId ? getListing(db, withId) : null,
  ]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-3xl px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <h1 className="max-w-[18ch] text-[36px] font-semibold leading-[1.05] sm:text-[44px]">
          {target ? `Propose a swap to ${target.name}.` : "Write the swap down, and we'll hold both sides to it."}
        </h1>
        {/* "Two minutes" was wrong: writing a deliverable specific enough to
            check is the hard part, not the typing. And the aimed version
            promised a link to send them, which the action deliberately
            withholds. */}
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          {target
            ? `Say what you'll give ${target.name} and what you'd want back. They'll find it on their own partner-list page, where their swaps already are, and can accept it, suggest changes, or decline. Neither of you needs an account.`
            : "The one part that takes thought is saying what you'll deliver, specifically enough that someone could check it happened. The rest is a name and a date. You get a private link for yourself and one to send your partner, and neither of you needs an account."}
        </p>

        <StartForm
          today={today}
          inTwoWeeks={inTwoWeeks}
          prefill={{
            from: you ? from ?? null : null,
            name: you?.party.name ?? "",
            website: you?.party.website ?? "",
            // A swap link carries the business forward but cannot rewrite it,
            // so the fields are shown as settled rather than as editable.
            editable: you?.canEditIdentity ?? true,
          }}
          target={target ? { id: target.id, name: target.name, needs: target.needs } : null}
        />
      </main>
    </div>
  );
}
