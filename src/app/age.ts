import { agoShort } from "./format";

/*
 * How old a hazard is, and whether it falls inside the window.
 *
 * The window means the same thing for every layer: the event's own date has to be inside it. GDACS keeps
 * flagging storms, fires and floods `iscurrent` for weeks, so an ongoing three-week-old fire is genuinely
 * burning - but the filter says 24 hours, and a control that governs one layer and not the others is worse
 * than a layer that empties. The key says when a layer is empty because of the window.
 *
 * Each layer is judged on the date it actually has: storms, fires and floods on their start, volcanoes on
 * their episode end, which is the only date nobody flags current.
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

/** Whether a hazard's own date falls inside the window. Undated stays, because dropping it would hide the
 * event and the reason for hiding it together. */
export function withinWindow(at: number | null, now: number, windowMs: number): boolean {
  if (at === null) return true;
  return now - at <= windowMs;
}
