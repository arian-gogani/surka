import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { Button, ButtonLink } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatShortDate } from "@/lib/dates";
import { KIND_LABEL } from "@/lib/present";
import { describeRecord } from "@/lib/reputation";
import { listListings } from "@/lib/services/swaps";
import { unlistPartyAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner list", robots: { index: false } };

/**
 * Moderation for the public partner list.
 *
 * Anyone can publish to it from /list with no account, so there has to be a
 * way to take something down. Without this the only remedy for a spam listing,
 * or for text written about somebody else's business, was editing the database
 * by hand.
 */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const listings = await listListings(await getDb());

  return (
    <AdminShell error={error} ok={ok}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Partner list</h1>
          <p className="mt-2 max-w-prose text-muted">
            Everything the public page at /partners is showing. Anyone can add themselves, so read new entries
            before they have been there long.
          </p>
        </div>
        <ButtonLink href="/partners">View the public page</ButtonLink>
      </div>

      {listings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-muted">
          Nobody is listed yet. A business lists itself from /list, or from its own swap page.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {listings.map((l) => (
            <li key={l.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="break-words font-medium">{l.name}</p>
                <p className="num text-[13px] text-muted">
                  {KIND_LABEL[l.kind]}, listed {formatShortDate(l.listedAt)}, {describeRecord(l.record)}
                </p>
              </div>
              {l.website ? (
                // nofollow and noreferrer: this is a link a stranger supplied,
                // and the operator opening it should not pass anything along.
                <p className="mt-0.5 break-all text-[13px]">
                  <a
                    href={l.website}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="text-muted underline underline-offset-2"
                  >
                    {l.website}
                  </a>
                </p>
              ) : null}
              <dl className="mt-2 grid gap-2 text-[14px] leading-relaxed sm:grid-cols-2">
                <div>
                  <dt className="text-[13px] text-muted">Offers</dt>
                  <dd className="break-words">{l.offers}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Wants</dt>
                  <dd className="break-words">{l.needs}</dd>
                </div>
              </dl>
              <form action={unlistPartyAction} className="mt-3">
                <input type="hidden" name="partyId" value={l.id} />
                {/* Takes it off the public page. The business and its own link
                    survive, so a mistake here is not destructive and the holder
                    can put themselves back. */}
                <Button type="submit" variant="danger">
                  Take off the list
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
