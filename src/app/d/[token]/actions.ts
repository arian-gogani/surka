"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { SwapStatus } from "@/db/schema";
import { messageFor } from "@/lib/errors";
import { markDelivered, reportResult, respond } from "@/lib/services/swaps";

function backTo(token: string, params: Record<string, string>): never {
  redirect(`/d/${encodeURIComponent(token)}?${new URLSearchParams(params)}`);
}

const DECIDED: Partial<Record<SwapStatus, string>> = {
  accepted: "Swap accepted. Your dates and reminders are below.",
  countered: "Thanks. We'll rework the terms and send you a new version.",
  declined: "Declined. Thanks for letting us know.",
};

export async function respondAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
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
  backTo(token, { ok: DECIDED[status] ?? "Saved." });
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
