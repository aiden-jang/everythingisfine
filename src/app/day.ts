/*
 * What counts as a day this app can load, in one place.
 *
 * The rule existed twice and was enforced in three different ways, which is how the third way came to be
 * a browser widget. `decode` checked the format, round-tripped it and required the day to be in the past;
 * `dayRange` only parsed; and the field in the rail relied on `type="date"` plus a `max` attribute, so the
 * ceiling for a typed date was enforced by Chrome rather than by this codebase. Replacing that widget would
 * have quietly removed the only guard on the path a person actually types into.
 *
 * So the guard moved to where every path goes through it: `loadArchive` refuses, and the field and the URL
 * both ask the same function the same question. The rail's stepper still checks its own ceiling, which is
 * now belt and braces rather than the enforcement.
 *
 * **"Has ended", not "is before now".** `decode` allowed `at < Date.now()`, which accepts today: a banner
 * reading "all day UTC" over a day that is still happening is the one claim the archive must not make. A
 * day qualifies once all 24 of its hours are behind us.
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
 * The field it replaced was a native date input, the only browser widget left in a hand-drawn interface:
 * a platform calendar button, a locale-dependent order, and `mm/dd/yyyy` asked for a format this app
 * never prints. Every date on screen here is ISO - the banner says "2011-03-11, all day UTC" and the
 * notable list writes the same - so the field now asks for what the app shows, and a date can be copied
 * out of the list and pasted straight in.
 *
 * Digits are the input and the hyphens are ours, which is what makes backspace behave: the value is
 * rebuilt from the digits every keystroke rather than edited in place, so deleting into a hyphen removes
 * the digit before it instead of stalling on punctuation.
 */
export function typedDay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** How long a complete day is, for a caller checking whether there is anything to say yet. */
export const DAY_LENGTH = "YYYY-MM-DD".length;
