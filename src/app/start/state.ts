/**
 * Shared shape for the start form.
 *
 * Deliberately not in actions.ts: a "use server" module may only export async
 * functions, so a plain object exported from there arrives as undefined on the
 * client and the form crashes on first render.
 */
export const START_FIELDS = [
  "from",
  "with",
  "title",
  "yourName",
  "yourKind",
  "yourWebsite",
  "yourEmail",
  "yourGive",
  "yourDue",
  "partnerName",
  "partnerKind",
  "partnerWebsite",
  "partnerGive",
  "partnerDue",
] as const;

export type StartField = (typeof START_FIELDS)[number];

export interface StartState {
  error: string | null;
  /** What they typed, returned on failure so eleven fields are not wiped. */
  values: Partial<Record<StartField, string>>;
}

export const EMPTY_START: StartState = { error: null, values: {} };
