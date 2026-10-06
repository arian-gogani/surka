"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createParty, createSwap, partyForToken } from "@/lib/services/swaps";
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

  let tokens: { a: string; b: string };
  try {
    const db = await getDb();
    // Holding a link from an earlier swap proves which business you are, so
    // carry that same party forward and let the track record accumulate.
    const returning = field("from") ? await partyForToken(db, field("from")) : null;
    const [you, partner] = await Promise.all([
      returning ??
        createParty(db, {
          name: field("yourName"),
          kind: field("yourKind") || "app",
          website: field("yourWebsite") || null,
          email: field("yourEmail") || null,
        }),
      createParty(db, {
        name: field("partnerName"),
        kind: field("partnerKind") || "other",
        website: field("partnerWebsite") || null,
      }),
    ]);

    const created = await createSwap(
      db,
      {
        title: field("title"),
        partyAId: you.id,
        partyBId: partner.id,
        commitments: [
          { side: "a", description: field("yourGive"), dueDate: field("yourDue") },
          { side: "b", description: field("partnerGive"), dueDate: field("partnerDue") },
        ],
      },
      { status: "proposed" },
    );
    tokens = created.tokens;
  } catch (error) {
    return fail(messageFor(error));
  }

  redirect(`/start/sent?a=${tokens.a}&b=${tokens.b}`);
}
