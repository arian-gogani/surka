"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { setListed } from "@/lib/services/swaps";

function backTo(token: string, params: Record<string, string>): never {
  redirect(`/p/${encodeURIComponent(token)}?${new URLSearchParams(params)}`);
}

export async function updateListingAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  // A checkbox the browser omits when unchecked is what lets one form both
  // save and remove, without a second route that could be posted to by mistake.
  const listed = formData.get("listed") !== null;
  try {
    await setListed(await getDb(), token, {
      listed,
      offers: formData.get("offers"),
      needs: formData.get("needs"),
    });
  } catch (error) {
    backTo(token, { error: messageFor(error) });
  }
  backTo(token, {
    ok: listed ? "Saved. Your listing is live." : "Removed from the partner list. This link still works if you change your mind.",
  });
}
