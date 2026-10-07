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
  approveListing,
  addTrackingLink,
  cancelSwap,
  createParty,
  createSwap,
  logOperatorMinutes,
  markProposed,
  replaceCommitments,
  unlistParty,
  verifyCommitment,
} from "@/lib/services/swaps";
import type { NewSwapState } from "./swaps/new/state";

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

/**
 * A ceiling across every address at once.
 *
 * Per-address throttling does nothing to a guesser spread over many
 * addresses, and there is exactly one password and one person who needs it.
 * Fifty failures an hour is far above any real mistyping and far below a
 * useful guessing rate.
 */
const LOGIN_TOTAL = 50;

export async function loginAction(formData: FormData) {
  const limit = rateLimit(`login:${clientKey(await headers())}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const global = rateLimit("login:everyone", LOGIN_TOTAL, LOGIN_WINDOW_MS);
  if (!limit.ok || !global.ok) {
    const retry = Math.max(
      limit.ok ? 0 : limit.retryAfterSeconds,
      global.ok ? 0 : global.retryAfterSeconds,
    );
    go("/admin/login", { error: `Too many attempts. Try again in ${retry} seconds.` });
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

/**
 * Returns state rather than redirecting on failure.
 *
 * A rejected swap used to bounce back to an empty form, so "Both sides must
 * give something" cost the operator the title, both businesses, every
 * commitment row and the notes. There are up to twelve rows to retype.
 */
export async function createSwapAction(_prev: NewSwapState, formData: FormData): Promise<NewSwapState> {
  await requireOperator();
  const rows = readCommitments(formData);
  let swapId: string;
  try {
    const { swap } = await createSwap(await getDb(), {
      title: formData.get("title"),
      partyAId: formData.get("partyAId"),
      partyBId: formData.get("partyBId"),
      notes: formData.get("notes"),
      commitments: rows,
    });
    swapId = swap.id;
  } catch (error) {
    return {
      error: messageFor(error),
      values: {
        title: String(formData.get("title") ?? ""),
        partyAId: String(formData.get("partyAId") ?? ""),
        partyBId: String(formData.get("partyBId") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      },
      // readCommitments drops blank lines, which is what we want to show back:
      // the rows with something in them, plus the spare lines TermsFields adds.
      rows: rows.map((r) => ({ side: r.side === "b" ? "b" : "a", description: r.description, dueDate: r.dueDate })),
    };
  }
  go(`/admin/swaps/${swapId}`, { ok: "Swap created. Check the terms, then send the partner their link." });
}

export async function approveListingAction(formData: FormData) {
  await requireOperator();
  try {
    await approveListing(await getDb(), String(formData.get("partyId") ?? ""));
  } catch (error) {
    go("/admin/listings", { error: messageFor(error) });
  }
  go("/admin/listings", { ok: "Approved. It's on the public partner list now." });
}

export async function unlistPartyAction(formData: FormData) {
  await requireOperator();
  try {
    await unlistParty(await getDb(), String(formData.get("partyId") ?? ""));
  } catch (error) {
    go("/admin/listings", { error: messageFor(error) });
  }
  go("/admin/listings", { ok: "Taken off the partner list. Their own link still works." });
}

/** `success` may read the run's result, so an action can report what it actually did. */
async function onSwap<T>(
  formData: FormData,
  run: (swapId: string) => Promise<T>,
  success: string | ((result: T) => string),
) {
  await requireOperator();
  const swapId = String(formData.get("swapId") ?? "");
  // Without a swap id both branches below redirect to /admin/swaps/, which is
  // a 404, so the error message is lost entirely.
  if (!swapId) go("/admin", { error: "That swap link was incomplete. Open the swap and try again." });
  let result: T;
  try {
    result = await run(swapId);
  } catch (error) {
    go(`/admin/swaps/${swapId}`, { error: messageFor(error) });
  }
  go(`/admin/swaps/${swapId}`, { ok: typeof success === "function" ? success(result) : success });
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
  // Authenticate before touching the body. Otherwise an unauthenticated post
  // builds a redirect out of a caller-supplied path segment rather than
  // bouncing to the login.
  await requireOperator();
  const outcome = String(formData.get("outcome") ?? "");
  if (outcome !== "kept" && outcome !== "missed" && outcome !== "pending") {
    go(`/admin/swaps/${String(formData.get("swapId") ?? "")}`, { error: "Pick kept or missed." });
  }
  await onSwap(
    formData,
    async () => verifyCommitment(await getDb(), String(formData.get("commitmentId") ?? ""), outcome),
    // The last check is the moment the whole pilot is working toward, and it
    // used to report the same "Marked kept." as the first one.
    ({ swapCompleted }) => {
      if (outcome === "pending") {
        return swapCompleted ? "Reopened." : "Reopened. This swap is back in progress.";
      }
      return swapCompleted ? `Marked ${outcome}. That was the last check, so the swap is complete.` : `Marked ${outcome}.`;
    },
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
