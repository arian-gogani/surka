import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { getDb } from "@/db/client";
import { addDays, toDateOnly } from "@/lib/dates";
import { partyForToken } from "@/lib/services/swaps";
import { startSwapAction } from "./actions";

/** Mirrors the kinds accepted by partyInput; shown on the deal sheet under each name. */
const KINDS = [
  { value: "app", label: "App or software" },
  { value: "newsletter", label: "Newsletter" },
  { value: "community", label: "Community" },
  { value: "creator", label: "Creator" },
  { value: "other", label: "Something else" },
] as const;

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

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;
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

        {error ? (
          <div className="mt-6">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}

        <form action={startSwapAction} className="mt-10 space-y-8">
          {you ? <input type="hidden" name="from" value={from} /> : null}

          <Field label="What's the swap?" hint="A few words. Both sides see this.">
            <input
              name="title"
              required
              minLength={3}
              maxLength={140}
              placeholder="Newsletter feature for an extended trial"
              className="field"
            />
          </Field>

          <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
            <legend className="px-2 text-sm font-semibold">Your side</legend>
            {you ? (
              <p className="text-[15px] text-muted">
                Carrying over <span className="font-medium text-ink">{you.name}</span> from your last swap, so your
                record builds up instead of starting over.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your business">
                <input
                  name="yourName"
                  required
                  maxLength={120}
                  defaultValue={you?.name ?? ""}
                  placeholder="Clinic Scheduler"
                  className="field"
                />
              </Field>
              <Field label="What kind">
                <select name="yourKind" className="field" defaultValue={you?.kind ?? "app"}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Website" hint="Optional">
              <input
                name="yourWebsite"
                type="url"
                defaultValue={you?.website ?? ""}
                placeholder="https://example.com"
                className="field"
              />
            </Field>
            <Field label="Your email" hint="Optional. For swap reminders if email delivery is enabled.">
              <input
                name="yourEmail"
                type="email"
                autoComplete="email"
                defaultValue={you?.email ?? ""}
                className="field"
              />
            </Field>
            <Field label="What you'll give" hint="Be specific enough that someone could check it happened.">
              <input
                name="yourGive"
                required
                minLength={3}
                maxLength={500}
                placeholder="An extra free month for readers who sign up through the link"
                className="field"
              />
            </Field>
            <Field label="By when">
              <input name="yourDue" type="date" required min={today} defaultValue={inTwoWeeks} className="field" />
            </Field>
          </fieldset>

          <fieldset className="space-y-4 rounded-xl border border-line bg-white p-5">
            <legend className="px-2 text-sm font-semibold">Their side</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Their business">
                <input
                  name="partnerName"
                  required
                  maxLength={120}
                  placeholder="Practice Manager Weekly"
                  className="field"
                />
              </Field>
              <Field label="What kind">
                <select name="partnerKind" className="field" defaultValue="newsletter">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Website" hint="Optional">
              <input name="partnerWebsite" type="url" placeholder="https://example.com" className="field" />
            </Field>
            <Field label="What they'll give" hint="They can accept this, suggest changes, or decline.">
              <input
                name="partnerGive"
                required
                minLength={3}
                maxLength={500}
                placeholder="A dedicated section in the October 17 issue"
                className="field"
              />
            </Field>
            <Field label="By when">
              <input name="partnerDue" type="date" required min={today} defaultValue={inTwoWeeks} className="field" />
            </Field>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton pendingLabel="Creating...">Create the deal sheet</SubmitButton>
            <p className="text-[15px] text-muted">Nothing is sent anywhere until you share the link yourself.</p>
          </div>
        </form>
      </main>
    </div>
  );
}
