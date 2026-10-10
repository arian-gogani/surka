import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatShortDate } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { KIND_LABEL } from "@/lib/present";
import { describeRecord } from "@/lib/reputation";
import { getListing, type Listing } from "@/lib/services/swaps";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * A listing's own page.
 *
 * The list is one page for everybody, which is not a thing a founder wants to
 * send anyone. This is: a URL that is about them, that they can put in a reply
 * or a bio, and that a search for their kind of partner can find. Every one of
 * them is also a door back into the product for whoever reads it.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(await getDb(), id);
  if (!listing) return { title: "Not found", robots: { index: false } };

  // The record is the part no competitor directory has, so it goes in the
  // description where a search result will actually show it.
  const description = `${listing.name} is looking for a cross-promotion partner. Offering: ${trim(listing.offers, 110)} ${describeRecord(listing.record)}.`;
  return {
    title: `${listing.name} wants a cross-promotion partner`,
    description,
    alternates: { canonical: `/partners/${listing.id}` },
    openGraph: {
      type: "profile",
      title: `${listing.name} wants a cross-promotion partner`,
      description,
      url: `${appUrl()}/partners/${listing.id}`,
    },
  };
}

function trim(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export default async function ListingProfile({ params }: Props) {
  const { id } = await params;
  const listing = await getListing(await getDb(), id);
  if (!listing) notFound();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={30} />
        </a>
        <ButtonLink href="/partners">See everyone</ButtonLink>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <p className="text-[0.9375rem] text-muted">{KIND_LABEL[listing.kind]}</p>
        <h1 className="mt-1 break-words text-[36px] font-semibold leading-[1.05] sm:text-[44px]">
          {listing.name}
        </h1>
        <p className="mt-4 text-lg text-muted">
          Looking for a cross-promotion partner. Listed {formatShortDate(listing.listedAt)}.
        </p>

        {/* Said plainly and early. It is the one claim on this page that the
            business cannot write about itself. */}
        <p className="mt-6 inline-flex rounded-lg border border-kept/30 bg-kept-wash px-4 py-2 text-[0.9375rem] font-medium text-kept-deep">
          {describeRecord(listing.record)}
        </p>

        <dl className="mt-10 space-y-8">
          <div>
            <dt className="text-sm font-semibold text-muted">What they can offer a partner</dt>
            <dd className="mt-2 max-w-prose break-words text-lg leading-relaxed">{listing.offers}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-muted">What they&apos;re looking for</dt>
            <dd className="mt-2 max-w-prose break-words text-lg leading-relaxed">{listing.needs}</dd>
          </div>
          {listing.website ? (
            <div>
              <dt className="text-sm font-semibold text-muted">Website</dt>
              <dd className="mt-2 break-all">
                {/* nofollow: a listing is self-published, so it must not be a
                    way to buy a link from this domain. */}
                <a
                  href={listing.website}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                  className="underline underline-offset-4"
                >
                  {listing.website}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-12 rounded-xl border border-spark/40 bg-white px-6 py-7">
          <h2 className="text-xl font-semibold">Propose a swap to {listing.name}</h2>
          <p className="mt-2 max-w-prose text-muted">
            Say what each side gives and by when. They can accept it, suggest changes, or decline. Then Surka
            holds both of you to the dates and checks each part actually shipped. No account, for either of you.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href={`/start?with=${listing.id}`} variant="action">
              Propose a swap
            </ButtonLink>
            <ButtonLink href="/list">List your own business</ButtonLink>
          </div>
        </div>

        <p className="mt-10 text-[0.9375rem] text-muted">
          <Link href="/partners" className="underline underline-offset-4">
            Everyone looking for a partner
          </Link>
        </p>
      </main>

      {/* Organization rather than Person: these are businesses, and the shape
          is what lets a search result show the name and description together.
          Deliberately no aggregateRating. It emitted ratingValue as the kept
          count and bestRating as the resolved count, so "Kept 1 of 1" became
          a five-star snippet and "Kept 8 of 10" read as 8 out of a default
          scale of 5, which ranks the best business below the worst. Worse, it
          claimed ratingCount raters who do not exist: nobody reviewed anything,
          the operator checked a link the business supplied. A count of kept
          promises is not a rating, and it is already in the page text and the
          description where it belongs. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured(listing)) }}
      />
    </div>
  );
}

function structured(listing: Listing) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: listing.name,
    ...(listing.website ? { url: listing.website } : {}),
    description: listing.offers,
  };
}
