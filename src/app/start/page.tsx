import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { getDb } from "@/db/client";
import { addDays, toDateOnly } from "@/lib/dates";
import { partyForToken } from "@/lib/services/swaps";
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

export default async function StartPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  // A deadline in the past is always a mis-click here, so the picker won't offer one.
  const today = toDateOnly(new Date());
  const inTwoWeeks = addDays(today, 14);
  // Arriving from an existing swap link: we already know who this side is, and
  // reusing that business is what lets their track record build up over swaps.
  const you = from ? await partyForToken(await getDb(), from) : null;

  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-3xl px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <h1 className="max-w-[18ch] text-[36px] font-semibold leading-[1.05] sm:text-[44px]">
          Write the swap down, and we&apos;ll hold both sides to it.
        </h1>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          Two minutes. You get a private link for yourself and one to send your partner. Neither of you
          needs an account.
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
        />
      </main>
    </div>
  );
}
