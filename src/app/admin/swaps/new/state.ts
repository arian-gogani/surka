import type { TermRow } from "@/components/terms-fields";

/**
 * Shared shape for the new-swap form.
 *
 * Not in actions.ts: a "use server" module may only export async functions, so
 * a plain object exported from there arrives as undefined on the client.
 */
export interface NewSwapState {
  error: string | null;
  /** What the operator typed, handed back on failure instead of wiped. */
  values: { title?: string; partyAId?: string; partyBId?: string; notes?: string };
  /** Null until a submit fails, so the page keeps its own default rows. */
  rows: TermRow[] | null;
}

export const EMPTY_NEW_SWAP: NewSwapState = { error: null, values: {}, rows: null };
