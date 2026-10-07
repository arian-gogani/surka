"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { signNotice } from "@/lib/notice";
import { setListed } from "@/lib/services/swaps";

async function backTo(token: string, params: { ok?: string; error?: string }): Promise<never> {
  const signed = await signNotice(params);
  redirect(`/p/${encodeURIComponent(token)}?${new URLSearchParams(signed)}`);
}

export async function updateListingAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
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
  return backTo(token, {
    ok: listed ? "Saved. Your listing is live." : "Removed from the partner list. This link still works if you change your mind.",
  });
}
