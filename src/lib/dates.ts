export const DAY_MS = 86_400_000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date in UTC as YYYY-MM-DD. Surka schedules in UTC throughout. */
export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidDateOnly(value: string): boolean {
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toDateOnly(d) === value;
}

/** UTC midnight of a YYYY-MM-DD date. */
export function parseDateOnly(value: string): Date {
  const m = DATE_ONLY.exec(value);
  if (!m) throw new Error(`Not a date: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Whole days from today (UTC) until the date. Negative once it has passed. */
export function daysUntil(dateOnly: string, now: Date): number {
  const today = parseDateOnly(toDateOnly(now));
  return Math.round((parseDateOnly(dateOnly).getTime() - today.getTime()) / DAY_MS);
}

export function addDays(dateOnly: string, days: number): string {
  return toDateOnly(new Date(parseDateOnly(dateOnly).getTime() + days * DAY_MS));
}

const LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(dateOnly: string): string {
  return LONG.format(parseDateOnly(dateOnly));
}

export function formatShortDate(value: Date | string): string {
  return SHORT.format(typeof value === "string" ? parseDateOnly(value) : value);
}

/** "in 3 days", "today", "2 days ago" relative to now. */
export function relativeDue(dateOnly: string, now: Date): string {
  const d = daysUntil(dateOnly, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}
