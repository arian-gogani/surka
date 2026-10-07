"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { signNotice } from "@/lib/notice";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createListing } from "@/lib/services/swaps";
import { LIST_FIELDS, type ListField, type ListState } from "./state";

/** Three listings per address per hour. A founder lists once; a script gets nowhere. */
const LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Adds a business to the public partner list and mints its private link.
 *
 * Returns rather than redirecting on failure, so a rejected submit keeps the
 * six fields instead of emptying the form.
 */
export async function createListingAction(_previous: ListState, formData: FormData): Promise<ListState> {
  const field = (name: ListField) => String(formData.get(name) ?? "").trim();
  const values = Object.fromEntries(LIST_FIELDS.map((name) => [name, field(name)])) as ListState["values"];
  const fail = (error: string): ListState => ({ error, values });

  const limit = rateLimit(`list:${clientKey(await headers())}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return fail(`That's a few too many listings at once. Try again in ${limit.retryAfterSeconds} seconds.`);
  }

  let token: string;
  try {
    const created = await createListing(await getDb(), {
      name: field("name"),
      kind: field("kind") || "app",
      website: field("website") || null,
      email: field("email") || null,
      offers: field("offers"),
      needs: field("needs"),
    });
    token = created.token;
  } catch (error) {
    return fail(messageFor(error));
  }

  // Straight to the page the link opens, rather than a one-time confirmation
  // screen. The link is in the address bar from here on, which is the one place
  // someone might actually keep it.
  const signed = await signNotice({
    ok: "You're on the partner list. Keep this page's link: it's how you edit or remove your listing.",
  });
  redirect(`/p/${token}?${new URLSearchParams(signed)}`);
}
