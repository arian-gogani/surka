"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor, SurkaError } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createParty, createSwap, getListing, getParty, partyForToken, updatePartyIdentity } from "@/lib/services/swaps";
import { commitmentInput, firstIssue, swapTitle } from "@/lib/validation";
import { START_FIELDS, type StartField, type StartState } from "./state";

/** Five swaps per address per hour: generous for a real founder, dull for a script. */
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * The public path into a swap. Creates both businesses, then the swap and its
 * two commitments, proposed from the start so the partner's link is live.
 *
 * Returns rather than redirecting on failure. Redirecting threw away what they
 * had typed, and this form has eleven fields: one rejected date meant retyping
 * both businesses, both deliverables and the title. useActionState keeps the
 * values without JavaScript too, so the no-JS path still works.
 */
export async function startSwapAction(_previous: StartState, formData: FormData): Promise<StartState> {
  const field = (name: StartField) => String(formData.get(name) ?? "").trim();
  const values = Object.fromEntries(START_FIELDS.map((name) => [name, field(name)])) as StartState["values"];
  const fail = (error: string): StartState => ({ error, values });

  const limit = rateLimit(clientKey(await headers()), LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return fail(`That's a few too many swaps at once. Try again in ${limit.retryAfterSeconds} seconds.`);
  }

  // Check the parts that can fail before writing any businesses. Creating the
  // parties first meant a rejected date left two orphan rows behind, and a
  // retry left two more, cluttering the operator's list with businesses that
  // belong to no swap.
  const terms = [
    { side: "a", description: field("yourGive"), dueDate: field("yourDue") },
    { side: "b", description: field("partnerGive"), dueDate: field("partnerDue") },
  ];
  for (const term of terms) {
    const parsed = commitmentInput.safeParse(term);
    // Name the side. "Describe what will be delivered" and "Pick a due date"
    // apply equally to both halves of this form, so the bare message left
    // someone to re-read fourteen fields to find which one it meant.
    if (!parsed.success) {
      const side = term.side === "a" ? "Your side" : "Their side";
      return fail(`${side}: ${firstIssue(parsed.error)}`);
    }
  }
  // The title is checked here too. The browser enforces minLength on the raw
  // value while the server trims, so a title of three spaces passed the form
  // and then failed inside createSwap, after both businesses had been written.
  const title = swapTitle.safeParse(field("title"));
  if (!title.success) return fail(firstIssue(title.error));

  let tokens: { a: string; b: string };
  let aimedAtListing = false;
  try {
    const db = await getDb();
    // Holding a link from an earlier swap proves which business you are, so
    // carry that same party forward and let the track record accumulate.
    const returning = field("from") ? await partyForToken(db, field("from")) : null;
    // The "Your side" fields stay editable when a business carries over, so
    // what is in them has to be saved. They used to be read and discarded, so
    // a returning founder adding the email they forgot last time, or fixing a
    // typo in their name, watched both silently vanish.
    const mine = {
      name: field("yourName"),
      kind: field("yourKind") || "app",
      website: field("yourWebsite") || null,
      email: field("yourEmail") || null,
    };
    // Proposing to a business from the directory reuses that business rather
    // than minting a copy of it. Otherwise every proposal aimed at the same
    // listing creates another row, and the record the directory is advertising
    // never accumulates. Only listed businesses: this is a public id, and it
    // must not be a way to attach yourself to a private one.
    const target = field("with") ? await getListing(db, field("with")) : null;
    aimedAtListing = target !== null;
    const [you, partner] = await Promise.all([
      returning ? updatePartyIdentity(db, returning.id, mine) : createParty(db, mine),
      target
        ? getParty(db, target.id).then((row) => {
            if (!row) throw new SurkaError("That business isn't listed anymore.", "not_found");
            return row;
          })
        : createParty(db, {
            name: field("partnerName"),
            kind: field("partnerKind") || "other",
            website: field("partnerWebsite") || null,
          }),
    ]);

    const created = await createSwap(
      db,
      {
        title: title.data,
        partyAId: you.id,
        partyBId: partner.id,
        commitments: terms,
      },
      target
        ? /*
           * Aimed at a business already on the partner list, so the proposer
           * never sees that side's token.
           *
           * The token is that business's own proof of identity. Handing it over
           * let the proposer rewrite the victim's public listing text, their
           * name, their website, and the address their reminders go to, by
           * reading a party id off the public directory and posting this form
           * twice. The partner finds the proposal on their own listing page
           * instead, which is where their swaps are already listed.
           */
          { status: "proposed", openedBy: "directory", withhold: "b" }
        : // Nobody else is going to send it, so the proposer has to, and their
          // own page shows it to them because of this.
          { status: "proposed", openedBy: "proposer" },
    );
    tokens = created.tokens;
  } catch (error) {
    return fail(messageFor(error));
  }

  // No b in the query string when it was withheld: nothing should be able to
  // reconstruct it from a URL, a log, or browser history.
  redirect(aimedAtListing ? `/start/sent?a=${tokens.a}` : `/start/sent?a=${tokens.a}&b=${tokens.b}`);
}
