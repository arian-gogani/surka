import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { Button, ButtonLink } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatShortDate } from "@/lib/dates";
import { KIND_LABEL } from "@/lib/present";
import { describeRecord } from "@/lib/reputation";
import { listListings, type Listing, pendingListings } from "@/lib/services/swaps";
import { approveListingAction, unlistPartyAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner list", robots: { index: false } };

/**
 * The gate in front of the public partner list.
 *
 * Anyone can ask to be on it from /list with no account, and nothing in the
 * product can tell whether a listing is the business it names. So one person
 * reads each one before a stranger can. Email verification is the usual answer
 * and needs an email provider; this needs nothing and works today.
 */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const db = await getDb();
  const [pending, live] = await Promise.all([pendingListings(db), listListings(db)]);

  return (
    <AdminShell error={error} ok={ok}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Partner list</h1>
          <p className="mt-2 max-w-prose text-muted">
            Nothing here is public until you approve it. Read the name and the website: the one thing you are
            checking is whether this is plausibly that business, since nothing else can.
          </p>
        </div>
        <ButtonLink href="/partners">View the public page</ButtonLink>
      </div>

      <section aria-labelledby="pending">
        <h2 id="pending" className="text-xl font-semibold">
          {pending.length === 0 ? "Nothing waiting" : pending.length === 1 ? "1 waiting on you" : `${pending.length} waiting on you`}
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-muted">New requests show up here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-spark/40 bg-white">
            {pending.map((l) => (
              <li key={l.id} className="px-5 py-4">
                <Entry listing={l} label="Asked" />
                {/* The record follows the business row, and submitting the
                    public form again makes a new row, so a bad record is shed
                    by delisting and re-listing. This is the only place that
                    can be caught. */}
                {l.sameSite.length > 0 ? (
                  <p className="mt-2 rounded-md border border-spark/40 bg-spark-wash px-3 py-2 text-[14px] text-[#7a2410]">
                    Same website as{" "}
                    {l.sameSite.map((other, i) => (
                      <span key={other.partyId}>
                        {i > 0 ? ", " : null}
                        {other.name} ({describeRecord(other.record).toLowerCase()})
                      </span>
                    ))}
                    . This may be a second listing for a business that already has a record.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <form action={approveListingAction}>
                    <input type="hidden" name="partyId" value={l.id} />
                    <Button type="submit" variant="action">
                      Put it on the list
                    </Button>
                  </form>
                  <form action={unlistPartyAction}>
                    <input type="hidden" name="partyId" value={l.id} />
                    {/* Clears the request as well, or it reappears here
                        tomorrow waiting to be declined again. */}
                    <Button type="submit" variant="danger">
                      Decline
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="live">
        <h2 id="live" className="text-xl font-semibold">
          On the public list
        </h2>
        {live.length === 0 ? (
          <p className="mt-2 text-muted">Nobody yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {live.map((l) => (
              <li key={l.id} className="px-5 py-4">
                <Entry listing={l} label="Listed" />
                <form action={unlistPartyAction} className="mt-3">
                  <input type="hidden" name="partyId" value={l.id} />
                  {/* Only clears listedAt and the request. The business, its
                      record and its own link survive, so a mistaken takedown is
                      recoverable by the holder rather than destructive. */}
                  <Button type="submit" variant="danger">
                    Take off the list
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

function Entry({ listing, label }: { listing: Listing; label: string }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="break-words font-medium">{listing.name}</p>
        <p className="num text-[13px] text-muted">
          {KIND_LABEL[listing.kind]}, {label.toLowerCase()} {formatShortDate(listing.listedAt)},{" "}
          {describeRecord(listing.record)}
        </p>
      </div>
      {listing.website ? (
        // nofollow and noreferrer: a stranger supplied this, and opening it
        // should not pass anything along.
        <p className="mt-0.5 break-all text-[13px]">
          <a
            href={listing.website}
            rel="noopener noreferrer nofollow"
            target="_blank"
            className="text-muted underline underline-offset-2"
          >
            {listing.website}
          </a>
        </p>
      ) : null}
      <dl className="mt-2 grid gap-2 text-[14px] leading-relaxed sm:grid-cols-2">
        <div>
          <dt className="text-[13px] text-muted">Offers</dt>
          <dd className="break-words">{listing.offers}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Wants</dt>
          <dd className="break-words">{listing.needs}</dd>
        </div>
      </dl>
    </>
  );
}
