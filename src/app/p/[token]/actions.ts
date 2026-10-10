"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { signNotice } from "@/lib/notice";
import { getListingForToken, setListed } from "@/lib/services/swaps";

async function backTo(token: string, params: { ok?: string; error?: string }): Promise<never> {
  const signed = await signNotice(params);
  redirect(`/p/${encodeURIComponent(token)}?${new URLSearchParams(signed)}`);
}

export async function updateListingAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  // Read before the write, so the message can tell a first request apart from
  // an edit to something already public.
  const before = await getListingForToken(await getDb(), token);
  const wasLive = before?.party.listedAt !== null && before?.party.listedAt !== undefined;
  // A checkbox the browser omits when unchecked is what lets one form both
  // save and remove, without a second route that could be posted to by mistake.
  const listed = formData.get("listed") !== null;
  try {
    await setListed(await getDb(), token, {
      listed,
      website: formData.get("website"),
      offers: formData.get("offers"),
      needs: formData.get("needs"),
    });
  } catch (error) {
    return backTo(token, { error: messageFor(error) });
  }
  // Three states, not two. "Your listing is live" fired for the first request
  // as well, where setListed had just written listedAt: null, so it contradicted
  // the paragraph the reader lands on.
  return backTo(token, { ok: saved(listed, wasLive) });
}

function saved(listed: boolean, wasLive: boolean): string {
  if (!listed) return "Removed from the partner list. This link still works if you change your mind.";
  if (wasLive) return "Saved. It's public now, and we read changes before they go out.";
  return "Saved. We'll read it before it goes public, usually within a day.";
}
