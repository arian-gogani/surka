/**
 * Compares two secrets without short-circuiting on the first difference.
 *
 * A plain === returns as soon as two characters differ, so the time it takes
 * leaks how much of a guess was correct. The difference is tiny and hard to
 * exploit across a network, but the cost of not leaking it is three lines.
 *
 * Length is compared first and does leak, which is fine here: both secrets are
 * fixed-length values we generate ourselves.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
