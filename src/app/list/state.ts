/**
 * Shared shape for the listing form.
 *
 * Not in actions.ts: a "use server" module may only export async functions, so
 * a plain object exported from there arrives as undefined on the client.
 */
export const LIST_FIELDS = ["name", "kind", "website", "email", "offers", "needs"] as const;

export type ListField = (typeof LIST_FIELDS)[number];

export interface ListState {
  error: string | null;
  /** What they typed, handed back on failure instead of wiped. */
  values: Partial<Record<ListField, string>>;
}

export const EMPTY_LIST: ListState = { error: null, values: {} };
