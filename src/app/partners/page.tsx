import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { getDb } from "@/db/client";
import { describeRecord } from "@/lib/reputation";
import { KIND_LABEL } from "@/lib/present";
import { listListings } from "@/lib/services/swaps";

/**
 * Indexable on purpose, unlike every other page that touches a swap.
 *
 * A swap used to need two founders who already knew each other, which meant
 * every swap needed the operator to personally know both of them. This is the
 * page that breaks that: a founder lists what they have and what they want,
 * and a stranger can propose to them without anyone making an introduction.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founders looking for a cross-promotion partner",
  description:
    "Software founders, newsletters and communities looking to cross-promote, with the record of what each one actually delivered. Propose a swap to any of them, no account needed.",
  alternates: { canonical: "/partners" },
};

export default async function PartnersPage() {
  const listings = await listListings(await getDb());

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
        <ButtonLink href="/list" variant="action">
          List your business
        </ButtonLink>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-24 sm:px-8">
        <h1 className="max-w-[22ch] text-[36px] font-semibold leading-[1.05] sm:text-[44px]">
          Founders looking for a swap partner.
        </h1>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          Each one said what they can offer and what they&apos;re after. Propose a swap to any of them and
          they can accept it, suggest changes, or decline. Neither of you needs an account.
        </p>

        <ButtonLink href="/list" variant="action" className="mt-8">
          List your business
        </ButtonLink>

        {listings.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-line bg-white px-6 py-12">
            <h2 className="break-words text-xl font-semibold">Nobody is listed yet</h2>
            <p className="mt-2 max-w-prose text-muted">
              Be the first. Say what you can offer and what you&apos;re after, and founders can propose swaps to
              you without an introduction.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href="/list" variant="action">
                List your business
              </ButtonLink>
              <ButtonLink href="/start">Already have a partner?</ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="mt-10 space-y-4">
            {listings.map((l) => (
              <li key={l.id} className="rounded-xl border border-line bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {/* The name goes to their page on Surka, not out to their
                      own site: the record and the proposal form are here. */}
                  <h2 className="break-words text-xl font-semibold">
                    <Link href={`/partners/${l.id}`} className="underline-offset-4 hover:underline">
                      {l.name}
                    </Link>
                  </h2>
                  {/* The record is the reason this page is worth reading. A
                      directory of names is a directory; a directory of names
                      with what each one delivered is a reason to trust one. */}
                  <p className="text-[13px] text-muted">
                    {KIND_LABEL[l.kind]}
                    <span aria-hidden="true"> &middot; </span>
                    <span className="sr-only">, </span>
                    {describeRecord(l.record)}
                  </p>
                </div>
                <dl className="mt-4 grid gap-4 text-[15px] leading-relaxed sm:grid-cols-2">
                  <div>
                    <dt className="text-[13px] font-medium text-muted">Can offer</dt>
                    <dd className="mt-0.5 break-words">{l.offers}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium text-muted">Looking for</dt>
                    <dd className="mt-0.5 break-words">{l.needs}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ButtonLink href={`/start?with=${l.id}`}>Propose a swap to {l.name}</ButtonLink>
                  <ButtonLink href={`/partners/${l.id}`}>Read more</ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
