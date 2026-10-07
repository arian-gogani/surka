/**
 * A fixed-window counter, kept in memory.
 *
 * This is deliberately modest. On serverless each instance holds its own
 * counters, so a determined attacker spreading requests across instances gets
 * more than the stated limit. It stops the realistic case, which is one script
 * hammering one endpoint, and it costs nothing to run. Move it to the database
 * or a shared store if public traffic ever justifies the write amplification.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const existing = windows.get(key);
  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) sweep(now);
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true };
}

/** Drop expired windows so a long-lived instance doesn't grow without bound. */
function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (now >= window.resetAt) windows.delete(key);
  }
}

/**
 * Best-effort client address.
 *
 * x-vercel-forwarded-for is set by the platform and cannot be forged by the
 * caller. x-forwarded-for can: the platform appends the real address to
 * whatever the client sent, so reading the *first* entry read the attacker's
 * own value, and a loop with a different fake address each time got a fresh
 * bucket every request. The last entry is the one the platform added.
 *
 * Falls back to a shared bucket, so unknown callers throttle each other rather
 * than going unlimited.
 */
export function clientKey(headers: Headers): string {
  const trusted = headers.get("x-vercel-forwarded-for")?.trim();
  if (trusted) return trusted;
  const chain = headers.get("x-forwarded-for")?.split(",") ?? [];
  const last = chain[chain.length - 1]?.trim();
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}
