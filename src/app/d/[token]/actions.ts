"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { SwapStatus } from "@/db/schema";
import { messageFor } from "@/lib/errors";
import { markDelivered, reportResult, respond, setSideEmail } from "@/lib/services/swaps";

function backTo(token: string, params: Record<string, string>): never {
  redirect(`/d/${encodeURIComponent(token)}?${new URLSearchParams(params)}`);
}

/**
 * Reminders are conditional on an address, so the accept message is too.
 *
 * It used to read "Your dates and reminders are below" whether or not the
 * partner filled the email field, which for most of them promised a nudge that
 * was never going to arrive. The deadline-chasing is the product; claiming it
 * is running when it is not is the one thing this page must not do.
 */
function decided(status: SwapStatus, gaveEmail: boolean): string {
  switch (status) {
    case "accepted":
      return gaveEmail
        ? "Swap accepted. Your dates are below, and we'll remind you before each one."
        : "Swap accepted. Your dates are below. Add your email on this page if you want reminders.";
    case "countered":
      return "Thanks. We'll rework the terms and send you a new version.";
    case "declined":
      return "Declined. Thanks for letting us know.";
    default:
      return "Saved.";
  }
}

export async function respondAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  let status: SwapStatus;
  try {
    status = await respond(await getDb(), token, {
      decision: formData.get("decision"),
      message: formData.get("message"),
      email: formData.get("email"),
    });
  } catch (error) {
    backTo(token, { error: messageFor(error) });
  }
  backTo(token, { ok: decided(status, email !== "") });
}

export async function deliverAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await markDelivered(await getDb(), token, String(formData.get("commitmentId") ?? ""), {
      proofUrl: formData.get("proofUrl"),
    });
  } catch (error) {
    backTo(token, { error: messageFor(error) });
  }
  backTo(token, { ok: "Marked delivered. We'll check it and let your partner know." });
}

export async function reportResultAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await reportResult(await getDb(), token, {
      metric: formData.get("metric"),
      value: formData.get("value"),
      note: formData.get("note"),
    });
  } catch (error) {
    backTo(token, { error: messageFor(error) });
  }
  backTo(token, { ok: "Result saved. Only the two sides of this swap can see it." });
}

export async function setEmailAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await setSideEmail(await getDb(), token, { email: formData.get("email") });
  } catch (error) {
    backTo(token, { error: messageFor(error) });
  }
  backTo(token, { ok: "Saved. We'll remind you before each deadline." });
}
