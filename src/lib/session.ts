// Operator session: a signed, expiring cookie. Uses Web Crypto so the same
// code runs in middleware (edge) and in server actions (node).

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

export async function createSessionValue(nowMs = Date.now()): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("Set SESSION_SECRET (16+ characters) to enable the dashboard.");
  const expires = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  return `${expires}.${await hmac(secret, `operator:${expires}`)}`;
}

/** Constant-time comparison for equal-length hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySessionValue(value: string | undefined, nowMs = Date.now()): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const [expiresRaw, signature] = value.split(".");
  const expires = Number(expiresRaw);
  if (!signature || !Number.isInteger(expires) || expires * 1000 < nowMs) return false;
  return sameHex(signature, await hmac(secret, `operator:${expires}`));
}

/** Checks the operator password without leaking its length through timing. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const secret = sessionSecret() ?? "surka";
  const [a, b] = await Promise.all([hmac(secret, candidate), hmac(secret, expected)]);
  return sameHex(a, b);
}
