/*
 * What counts as a day this app can load. Every path asks this one function.
 *
 * The rule used to live in three places, one of them a browser widget: the date field relied on `max`, so
 * Chrome was enforcing the ceiling for anything typed.
 *
 * "Has ended", not "is before now". `at < Date.now()` accepts today, and a banner reading "all day UTC"
 * over a day still in progress is the one claim the archive must not make.
 */

/** Midnight-to-midnight in UTC, so a shared link means the same day everywhere. */
const DAY_MS = 86_400_000;

/** A real calendar day, written the way this app writes every other date. */
export function isRealDay(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const at = Date.parse(`${iso}T00:00:00Z`);
  // Round-tripped, because `Date.parse` rolls 2026-02-31 forward into March rather than refusing it.
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === iso;
}

/** True once every hour of the day is in the past. */
export function hasEnded(iso: string, now: number): boolean {
  const at = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(at) && at + DAY_MS <= now;
}

/** The one question every path asks: can the archive draw this day? */
export function isArchivableDay(iso: string, now: number): boolean {
  return isRealDay(iso) && hasEnded(iso, now);
}

/**
 * What the viewer typed, as far along an ISO day as it has got.
 *
 * Every date on screen here is ISO, so the field asks for what the app shows and a date can be copied out
 * of the notable list and pasted straight in.
 *
 * Digits are the input and the hyphens are ours, which is what makes backspace behave: the value is rebuilt
 * from the digits every keystroke, so deleting into a hyphen removes the digit before it.
 */
export function typedDay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** How long a complete day is, for a caller checking whether there is anything to say yet. */
export const DAY_LENGTH = "YYYY-MM-DD".length;
