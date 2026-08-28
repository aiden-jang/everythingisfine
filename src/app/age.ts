import { agoShort } from "./format";

/*
 * How old a hazard is, and whether the window may judge it.
 *
 * Don't filter storms, fires or floods on their dates. GDACS keeps flagging them `iscurrent` long after
 * `todate` passes - a live fire's end date measured three days stale, a live cyclone's today - so an
 * interval filter drops events the agency calls current. The flag is the only honest signal. Those three
 * stay on screen and say how long they have been running instead.
 *
 * Nobody flags volcanoes current, so the episode date is all they have and the window judges them on it.
 */

/** A row's age. Ongoing events date from their start, because that is the number that surprises: a bare
 * row gave no hint that "Mozambique" had been burning for three weeks. */
export function spanWords(
  startedAt: number | null, endedAt: number | null, now: number, current: boolean,
): string {
  if (current) {
    if (startedAt === null) return "ongoing";
    const words = agoShort(startedAt, now);
    // "just now ongoing" reads as a stutter, and an event minutes old needs no duration.
    return words === "just now" ? "ongoing" : `${words} ongoing`;
  }
  const at = endedAt ?? startedAt;
  return at === null ? "" : `${agoShort(at, now)} ago`;
}

/** Whether a finished episode falls inside the window. Only for layers claiming no currency. Undated
 * stays, because dropping it would hide the event and the reason for hiding it together. */
export function endedWithin(endedAt: number | null, now: number, windowMs: number): boolean {
  if (endedAt === null) return true;
  return now - endedAt <= windowMs;
}
