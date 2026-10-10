// Signed result messages, so a banner on a token page is always the app's
// words and never a caller's.
//
// Every action on a swap or listing page redirects with its message in the
// query string, and the page renders it in a styled notice. That text is
// trusted-looking first-party copy on a page the reader has no other way to
// judge, and in the normal flow the proposer legitimately holds the partner's
// link, so they can hand over a URL carrying whatever success message they
// like. A signature costs one HMAC and keeps every message exactly as written,
// which an allowlist of codes would not.

import { constantTimeEquals } from "./compare";

const encoder = new TextEncoder();

/** Truncated to keep the URL short; 80 bits is far beyond guessing a forgery. */
const TAG_LENGTH = 20;

function secret(): string | null {
  const value = process.env.SESSION_SECRET;
  return value && value.length >= 16 ? value : null;
}

async function tag(message: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const imported = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", imported, encoder.encode(`notice:${message}`));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, TAG_LENGTH);
}

/** Query parameters carrying a message and its signature. */
export async function signNotice(params: { ok?: string; error?: string }): Promise<Record<string, string>> {
  const message = params.ok ?? params.error ?? "";
  if (!message) return {};
  const signature = await tag(message);
  return {
    ...(params.ok ? { ok: params.ok } : { error: message }),
    // Without a secret there is nothing to sign with, so no signature is sent
    // and verifyNotice will drop the message. Failing closed is right: a
    // deployment with no SESSION_SECRET cannot sign in to the dashboard either.
    ...(signature ? { s: signature } : {}),
  };
}

/** The message, or null if it was not signed by this deployment. */
export async function verifyNotice(
  message: string | undefined,
  signature: string | undefined,
): Promise<string | null> {
  if (!message || !signature) return null;
  const expected = await tag(message);
  return expected && constantTimeEquals(expected, signature) ? message : null;
}
