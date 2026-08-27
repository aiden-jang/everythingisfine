/*
 * Eclipses worth opening, because otherwise nobody will ever see one.
 *
 * The shadow only draws when the day on screen and the cursor on it happen to land inside a few hours
 * that occur two or three times a year. Left to chance that is a feature nobody finds, which is the same
 * as a feature nobody has.
 *
 * **Not in `NOTABLE_DAYS`, and the reason is that list's own shape.** It requires a magnitude, sorts by
 * it, labels every row with it, and its comment argues against growth. An eclipse has no magnitude and
 * needs a minute rather than a day, so forcing it in would break the list to borrow its affordance.
 *
 * **The table checks itself.** These times were written from memory, and a wrong one is invisible: the day
 * loads, the cursor sets, and nothing happens. `eclipseDays.test.ts` runs every entry through the same
 * geometry the globe uses and fails if the shadow is not actually there, so a misremembered minute cannot
 * ship as a dead row.
 *
 * Times are the published greatest eclipse, to the minute, in UTC.
 */

export interface EclipseDay {
  /** The UTC day, which is the span the archive loads. */
  day: string;
  /** Greatest eclipse, as `HH:MM` UTC. The cursor is put here, not at the day's edge. */
  at: string;
  /** Solar shadows fall on the planet; lunar ones fall on the moon. */
  kind: "solar" | "lunar";
  /** Where it was visible from, in the fewest words that place it. */
  what: string;
}

/*
 * Newest first, because these are days to visit rather than records to rank, and the most recent is the
 * one somebody is most likely to remember standing outside for.
 *
 * Short on purpose. This is a way in, not a catalogue, and the same argument `NOTABLE_DAYS` makes about
 * a dozen not seventy applies with more force here: a list of every eclipse this century would be four
 * hundred rows of a thing the app draws approximately.
 */
export const ECLIPSE_DAYS: readonly EclipseDay[] = [
  { day: "2026-08-12", at: "17:46", kind: "solar", what: "Total, Iceland and Spain" },
  { day: "2025-09-07", at: "18:11", kind: "lunar", what: "Total, Asia and Africa" },
  { day: "2025-03-14", at: "06:59", kind: "lunar", what: "Total, the Americas" },
  { day: "2024-04-08", at: "18:17", kind: "solar", what: "Total, Mexico to Newfoundland" },
  { day: "2023-10-14", at: "17:59", kind: "solar", what: "Annular, Oregon to Brazil" },
  { day: "2019-07-02", at: "19:24", kind: "solar", what: "Total, Chile and Argentina" },
  { day: "2017-08-21", at: "18:26", kind: "solar", what: "Total, coast to coast, USA" },
];

/** The entry's moment as a timestamp, which is what the cursor and the light both want. */
export function eclipseMoment(entry: EclipseDay): number {
  return Date.parse(`${entry.day}T${entry.at}:00Z`);
}
