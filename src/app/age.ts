import { agoShort } from "./format";

/* How old a hazard is, and whether the window keeps it. Don't judge these on `iscurrent`: GDACS flags a
   three-week-old fire as burning, so a currency filter governs one layer and not the others. See ARCHITECTURE.md#srcappagets. */

/** A row's age. Ongoing events date from their start: how long it has been burning is the surprise. */
export function spanWords(
  startedAt: number | null,
  endedAt: number | null,
  now: number,
  current: boolean,
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

/** Whether a hazard's date is inside the window. Undated stays: dropping it hides the reason too. */
export function withinWindow(at: number | null, now: number, windowMs: number): boolean {
  if (at === null) return true;
  return now - at <= windowMs;
}
