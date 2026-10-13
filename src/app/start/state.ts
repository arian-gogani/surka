/**
 * Shared shape for the start form.
 *
 * Deliberately not in actions.ts: a "use server" module may only export async
 * functions, so a plain object exported from there arrives as undefined on the
 * client and the form crashes on first render.
 */
/**
 * Nine, down from fourteen.
 *
 * Three were collected and used for nothing but a grey line of text: what kind
 * of business each side is, and the partner's website. A proposer's guess at a
 * stranger's canonical URL is a wrong value in a column that stranger cannot
 * see until they claim a listing, and both kinds are now set on the page that
 * actually publishes them. The reminder address moved to the deal sheet, where
 * there is already a form for it and where it can actually be used, since
 * reminders only fire on an accepted swap.
 */
export const START_FIELDS = [
  "from",
  "with",
  "title",
  "yourName",
  "yourWebsite",
  "yourGive",
  "yourDue",
  "partnerName",
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
