// Operator session: a signed, expiring cookie. Uses Web Crypto so the same
// code runs in middleware (edge) and in server actions (node).
import { constantTimeEquals } from "./compare";

export const SESSION_COOKIE = "surka_operator";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

/**
 * The signing key, bound to the current password.
 *
 * The signature used to cover only the expiry, so a cookie value that leaked
 * anywhere stayed valid for its full fortnight: signing out only deleted the
 * browser's copy, and changing the password did nothing either, because the
 * password was not part of what was signed. Mixing it in makes rotating the
 * password a sign-out everywhere, which is the one recovery action an operator
 * with no session store can actually take.
 */
function signingKey(secret: string): string {
  return `${secret}:${process.env.ADMIN_PASSWORD ?? ""}`;
}

export async function createSessionValue(nowMs = Date.now()): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("Set SESSION_SECRET (16+ characters) to enable the dashboard.");
  const expires = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  return `${expires}.${await hmac(signingKey(secret), `operator:${expires}`)}`;
}


export async function verifySessionValue(value: string | undefined, nowMs = Date.now()): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const [expiresRaw, signature] = value.split(".");
  const expires = Number(expiresRaw);
  if (!signature || !Number.isInteger(expires) || expires * 1000 < nowMs) return false;
  return constantTimeEquals(signature, await hmac(signingKey(secret), `operator:${expires}`));
}

/** Checks the operator password without leaking its length through timing. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const secret = sessionSecret() ?? "surka";
  const [a, b] = await Promise.all([hmac(secret, candidate), hmac(secret, expected)]);
  return constantTimeEquals(a, b);
}
