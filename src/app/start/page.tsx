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
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}): Promise<Metadata> {
  const { from } = await searchParams;
  return {
    title: "Start a swap",
    description:
      "Write down what each side gives and by when. You get two private links: one for you, one to send your partner.",
    referrer: "no-referrer",
    alternates: { canonical: "/start" },
    ...(from ? { robots: { index: false, follow: false } } : {}),
  };
}

type Query = { from?: string; with?: string };

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
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          {target
            ? `Two minutes. We'll give you a link to send ${target.name}, and they can accept it, suggest changes, or decline. Neither of you needs an account.`
            : "Two minutes. You get a private link for yourself and one to send your partner. Neither of you needs an account."}
        </p>

        <StartForm
          today={today}
          inTwoWeeks={inTwoWeeks}
          prefill={{
            from: you ? from ?? null : null,
            name: you?.name ?? "",
            kind: you?.kind ?? "",
            website: you?.website ?? "",
            email: you?.email ?? "",
          }}
          target={
            target
              ? { id: target.id, name: target.name, kind: target.kind, needs: target.needs }
              : null
          }
        />
      </main>
    </div>
  );
}
