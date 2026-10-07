import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { Logo } from "@/components/logo";
import { Button, ButtonLink, Field, Notice, StatusPill } from "@/components/ui";
import { getDb } from "@/db/client";
import { appUrl, contactEmail } from "@/lib/env";
import { KIND_LABEL } from "@/lib/present";
import { describeRecord } from "@/lib/reputation";
import { getListingForToken } from "@/lib/services/swaps";
import { updateListingAction } from "./actions";

export const dynamic = "force-dynamic";

/** A private link. Never indexed, and no referrer so it can't ride to another site. */
export const metadata: Metadata = {
  title: "Your listing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
};

export default async function ListingPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error, ok } = await searchParams;
  const view = await getListingForToken(await getDb(), token);
  if (!view) notFound();

  const { party, record, swaps } = view;
  const listed = party.listedAt !== null;
  const contact = contactEmail();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" aria-label="Surka home">
          <Logo size={26} />
        </a>
        <ButtonLink href="/partners">See the list</ButtonLink>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-5 pb-20 sm:px-8">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {ok ? <Notice tone="ok">{ok}</Notice> : null}

        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{party.name}</h1>
          <p className="mt-3 text-lg text-muted">
            {KIND_LABEL[party.kind]} &middot; {describeRecord(record)}
          </p>
          <p className="mt-3 max-w-prose text-muted">
            {listed
              ? "You're on the partner list, so founders can propose swaps to you from there."
              : "You're not on the partner list right now, so nobody can find you from it."}
          </p>
        </div>

        {/* This page is only reachable with the link, so the link is the whole
            account. Saying so once, with a way to copy it, is cheaper than
            every other way of recovering it. */}
        <aside className="rounded-xl border border-spark/40 bg-white px-6 py-6">
          <h2 className="text-xl font-semibold">Keep this link</h2>
          <p className="mt-2 max-w-prose text-muted">
            It is how you edit or remove your listing, and how your record follows you into your next swap.
            There is no password to reset, so bookmark it or mail it to yourself.
          </p>
          <div className="mt-4">
            <CopyLink url={`${appUrl()}/p/${token}`} />
          </div>
        </aside>

        <form action={updateListingAction} className="space-y-4 rounded-xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Your listing</h2>
          <Field label="What you can offer a partner" hint="Audience, placements, an integration, a bundle.">
            <textarea name="offers" rows={3} maxLength={1000} defaultValue={party.offers ?? ""} className="field" />
          </Field>
          <Field label="What you're looking for">
            <textarea name="needs" rows={3} maxLength={1000} defaultValue={party.needs ?? ""} className="field" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" name="listed" value="yes" variant="action">
              {listed ? "Save" : "Put me back on the list"}
            </Button>
            {listed ? <Button type="submit">Take me off the list</Button> : null}
          </div>
          <input type="hidden" name="token" value={token} />
        </form>

        <section aria-labelledby="swaps">
          <h2 id="swaps" className="text-xl font-semibold">
            Your swaps
          </h2>
          {swaps.length === 0 ? (
            <p className="mt-2 max-w-prose text-muted">
              None yet. Someone can propose one to you from the list, or you can{" "}
              <Link href={`/start?from=${token}`} className="font-medium text-ink underline underline-offset-4">
                propose one yourself
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {swaps.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="font-medium">
                    {/* The swap's own link, not this one: that page is where the
                        deal sheet, the delivery forms and the proof live. */}
                    {s.token ? (
                      <Link href={`/d/${s.token}`} className="underline-offset-4 hover:underline">
                        {s.title}
                      </Link>
                    ) : (
                      s.title
                    )}
                  </span>
                  <StatusPill status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/start?from=${token}`} variant="action">
            Start a swap
          </ButtonLink>
          <ButtonLink href="/partners">Find a partner</ButtonLink>
        </div>

        {contact ? (
          <footer className="border-t border-line pt-6 text-[14px] text-muted">
            <p>
              Something wrong?{" "}
              <a
                href={`mailto:${contact}?subject=${encodeURIComponent(`Listing: ${party.name}`)}`}
                className="-mx-1 inline-flex min-h-11 items-center px-1 font-medium text-ink underline underline-offset-4"
              >
                Email us
              </a>
              .
            </p>
          </footer>
        ) : null}
      </main>
    </div>
  );
}
