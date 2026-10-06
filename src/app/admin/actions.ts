"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { messageFor } from "@/lib/errors";
import { requireOperator } from "@/lib/operator";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createSessionValue, passwordMatches, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import {
  addResult,
  addTrackingLink,
  cancelSwap,
  createParty,
  createSwap,
  logOperatorMinutes,
  markProposed,
  replaceCommitments,
  verifyCommitment,
} from "@/lib/services/swaps";

function go(path: string, params: Record<string, string> = {}): never {
  const query = new URLSearchParams(params).toString();
  redirect(query ? `${path}?${query}` : path);
}

/** Rows named commitments.N.side / .description / .dueDate; blank rows are skipped. */
function readCommitments(formData: FormData) {
  const rows: { side: string; description: string; dueDate: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const description = String(formData.get(`commitments.${i}.description`) ?? "").trim();
    if (!description) continue;
    rows.push({
      side: String(formData.get(`commitments.${i}.side`) ?? ""),
      description,
      dueDate: String(formData.get(`commitments.${i}.dueDate`) ?? ""),
    });
  }
  return rows;
}

function partyFields(formData: FormData) {
  return {
    name: formData.get("name"),
    kind: formData.get("kind"),
    website: formData.get("website"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    offers: formData.get("offers"),
    needs: formData.get("needs"),
    notes: formData.get("notes"),
  };
}

/**
 * Ten tries per address per quarter hour. A person who mistypes twice never
 * meets it; a script gets nowhere. The password itself is long and random, but
 * that is a property of the password rather than of the login.
 */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function loginAction(formData: FormData) {
  const limit = rateLimit(`login:${clientKey(await headers())}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) {
    go("/admin/login", { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` });
  }

  const password = String(formData.get("password") ?? "");
  if (!(await passwordMatches(password))) {
    go("/admin/login", { error: "That password isn't right." });
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  go("/admin");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  go("/admin/login");
}

export async function createPartyAction(formData: FormData) {
  await requireOperator();
  try {
    await createParty(await getDb(), partyFields(formData));
  } catch (error) {
    go("/admin/parties", { error: messageFor(error) });
  }
  go("/admin/parties", { ok: "Business added." });
}

export async function createSwapAction(formData: FormData) {
  await requireOperator();
  let swapId: string;
  try {
    const { swap } = await createSwap(await getDb(), {
      title: formData.get("title"),
      partyAId: formData.get("partyAId"),
      partyBId: formData.get("partyBId"),
      notes: formData.get("notes"),
      commitments: readCommitments(formData),
    });
    swapId = swap.id;
  } catch (error) {
    go("/admin/swaps/new", { error: messageFor(error) });
  }
  go(`/admin/swaps/${swapId}`, { ok: "Swap created. Check the terms, then send the partner their link." });
}

async function onSwap(formData: FormData, run: (swapId: string) => Promise<unknown>, success: string) {
  await requireOperator();
  const swapId = String(formData.get("swapId") ?? "");
  try {
    await run(swapId);
  } catch (error) {
    go(`/admin/swaps/${swapId}`, { error: messageFor(error) });
  }
  go(`/admin/swaps/${swapId}`, { ok: success });
}

export async function markProposedAction(formData: FormData) {
  await onSwap(formData, async (id) => markProposed(await getDb(), id), "Marked as sent. It's waiting on the partner.");
}

export async function cancelSwapAction(formData: FormData) {
  await onSwap(
    formData,
    async (id) => cancelSwap(await getDb(), id, String(formData.get("reason") ?? "")),
    "Swap cancelled.",
  );
}

export async function replaceTermsAction(formData: FormData) {
  await onSwap(
    formData,
    async (id) => replaceCommitments(await getDb(), id, readCommitments(formData)),
    "Terms updated. Mark it as sent when the partner has the new version.",
  );
}

export async function verifyAction(formData: FormData) {
  const outcome = String(formData.get("outcome") ?? "");
  if (outcome !== "kept" && outcome !== "missed" && outcome !== "pending") {
    go(`/admin/swaps/${String(formData.get("swapId") ?? "")}`, { error: "Pick kept or missed." });
  }
  await onSwap(
    formData,
    async () => {
      const result = await verifyCommitment(await getDb(), String(formData.get("commitmentId") ?? ""), outcome);
      return result;
    },
    outcome === "pending" ? "Reopened." : `Marked ${outcome}.`,
  );
}

export async function addLinkAction(formData: FormData) {
  await onSwap(
    formData,
    async (id) =>
      addTrackingLink(await getDb(), id, {
        side: formData.get("side"),
        label: formData.get("label"),
        destinationUrl: formData.get("destinationUrl"),
      }),
    "Tracking link created.",
  );
}

export async function addResultAction(formData: FormData) {
  await onSwap(
    formData,
    async (id) =>
      addResult(await getDb(), id, {
        side: formData.get("side"),
        metric: formData.get("metric"),
        value: formData.get("value"),
        note: formData.get("note"),
      }),
    "Result saved.",
  );
}

export async function logMinutesAction(formData: FormData) {
  await onSwap(
    formData,
    async (id) => logOperatorMinutes(await getDb(), id, Number(formData.get("minutes"))),
    "Time logged.",
  );
}
