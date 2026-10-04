"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createParty, createSwap, markProposed } from "@/lib/services/swaps";

/** Five swaps per address per hour: generous for a real founder, dull for a script. */
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function back(params: Record<string, string>): never {
  redirect(`/start?${new URLSearchParams(params)}`);
}

/**
 * The public path into a swap. Creates both businesses, the swap and its two
 * commitments, then marks it proposed so the partner's link is live
 * immediately. The operator still sees it in the dashboard like any other.
 */
export async function startSwapAction(formData: FormData) {
  const limit = rateLimit(clientKey(await headers()), LIMIT, WINDOW_MS);
  if (!limit.ok) {
    back({ error: `That's a few too many swaps at once. Try again in ${limit.retryAfterSeconds} seconds.` });
  }

  const field = (name: string) => String(formData.get(name) ?? "").trim();
  let tokens: { a: string; b: string };

  try {
    const db = await getDb();
    const [you, partner] = await Promise.all([
      createParty(db, {
        name: field("yourName"),
        kind: field("yourKind") || "app",
        website: field("yourWebsite") || null,
      }),
      createParty(db, {
        name: field("partnerName"),
        kind: field("partnerKind") || "other",
        website: field("partnerWebsite") || null,
      }),
    ]);

    const created = await createSwap(db, {
      title: field("title"),
      partyAId: you.id,
      partyBId: partner.id,
      commitments: [
        { side: "a", description: field("yourGive"), dueDate: field("yourDue") },
        { side: "b", description: field("partnerGive"), dueDate: field("partnerDue") },
      ],
    });

    // Proposed rather than draft: whoever filled this in is ready to send it.
    await markProposed(db, created.swap.id);
    tokens = created.tokens;
  } catch (error) {
    back({ error: messageFor(error) });
  }

  redirect(`/start/sent?a=${tokens.a}&b=${tokens.b}`);
}
