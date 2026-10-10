/**
 * Compares two secrets without short-circuiting on the first difference.
 *
 * A plain === returns as soon as two characters differ, so the time it takes
 * leaks how much of a guess was correct. The difference is tiny and hard to
 * exploit across a network, but the cost of not leaking it is three lines.
 *
 * Length is compared first and does leak. That is deliberate and it is worth
 * being accurate about why: the expected value is always a fixed-length secret
 * we generated, so what leaks is the length of the candidate, which the caller
 * already knows because they sent it. The cron route compares a raw
 * Authorization header, so one side is attacker-controlled; that is fine for
 * the same reason, and the comment used to claim both sides were ours, which
 * was false at the only call site.
 *
 * The only copy. This was written out three times, in here, in the session
 * cookie check and in the notice signer, and a security primitive is exactly
 * the thing that should not be: a later switch to timingSafeEqual, or any
 * change to how the length is handled, has to land everywhere at once.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
