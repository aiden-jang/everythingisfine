/*
 * Days worth seeing, because the archive had no way in.
 *
 * The archive can draw any day since the catalogues begin, and its entry point was a blank `mm/dd/yyyy`
 * field: it required a date the viewer already knew, which almost nobody does. So the largest feature here
 * was also the least reachable, and everything the app is good at was stuck on whatever Tuesday it is.
 *
 * **The app already knew how to make these days extraordinary.** Park the cursor at the mainshock and press
 * play and 587 events arrive across a day with wavefronts expanding, the activity strip spiking, the
 * sequence strip stepping through the aftershocks and the boundary sentence reading against the trench.
 * None of that is new. This list is the key to it.
 *
 * Measured, not remembered. Every row below was fetched from USGS FDSN at M2.5+ for that UTC day before it
 * was written down, and `notableDays.live.test.ts` re-checks the magnitudes against the feed so a wrong
 * label fails rather than sits there.
 *
 * **Dates are UTC, and that is a trap worth naming.** Loma Prieta is remembered as 17 October 1989 and
 * struck at 00:04 UTC on the **18th**: asking for the 17th returns an M6.3 in Papua New Guinea. A famous
 * date is usually the local one. It is on the list under the 18th, which is the day the archive actually
 * loads and the day the event is in; the banner says "all day UTC" beside it. Prince William Sound is the
 * same story - remembered as Good Friday, 27 March 1964, and catalogued at 03:36 UTC on the 28th.
 *
 * **The oldest two are sparse, and that needs saying rather than implying.** 1960-05-22 holds the largest
 * earthquake ever recorded and **six events** at M2.5+; 1964-03-28 holds thirty-seven. That is the network
 * of the day, not a quiet planet, and a viewer given 6 against Tōhoku's 685 would draw the wrong
 * conclusion from a true number. `NOTABLE_NOTE` is the sentence that stops it.
 */

export interface NotableDay {
  /** The UTC day, which is the span the archive loads. */
  day: string;
  /** What happened, in the fewest words that identify it. */
  what: string;
  /** The largest magnitude the feed returns for that day, as measured. */
  magnitude: number;
}

/*
 * Largest first, because the two M9.1s are the reason to open this at all, and a list that buried them
 * under chronology would be filing rather than offering.
 *
 * A dozen, not seventy. A curated list stops being a way in once it needs its own search, and the ceiling
 * is a judgement rather than a limit: the test below holds it under sixteen so growth has to be argued for.
 */
export const NOTABLE_DAYS: readonly NotableDay[] = [
  { day: "1960-05-22", what: "Valdivia, Chile", magnitude: 9.5 },
  { day: "1964-03-28", what: "Prince William Sound, Alaska", magnitude: 9.2 },
  { day: "2011-03-11", what: "Tōhoku, Japan", magnitude: 9.1 },
  { day: "2004-12-26", what: "Sumatra–Andaman", magnitude: 9.1 },
  { day: "2010-02-27", what: "Maule, Chile", magnitude: 8.8 },
  // The only day here that gives the depth encoding anything to draw: 598km down, eight below 300.
  { day: "2013-05-24", what: "Sea of Okhotsk, 598 km deep", magnitude: 8.3 },
  { day: "2023-02-06", what: "Kahramanmaraş, Türkiye", magnitude: 7.8 },
  { day: "2015-04-25", what: "Gorkha, Nepal", magnitude: 7.8 },
  { day: "2018-09-28", what: "Palu, Indonesia", magnitude: 7.5 },
  { day: "2021-08-14", what: "Nippes, Haiti", magnitude: 7.2 },
  { day: "1989-10-18", what: "Loma Prieta, California", magnitude: 6.9 },
  { day: "1994-01-17", what: "Northridge, California", magnitude: 6.7 },
] as const;

/**
 * Why the oldest rows look empty.
 *
 * Required rather than decorative: 1960 returns six events and Tōhoku returns 685, and without this a
 * reader takes a true number as a claim about the planet instead of about how many seismometers existed.
 * The same rule as every layer in this app - nothing ships without the thing that explains it.
 */
export const NOTABLE_NOTE =
  "Older days hold fewer events: the networks were smaller, not the planet quieter.";

/**
 * The day as the archive wants it, or null when the string is not one of ours.
 *
 * A lookup rather than a parse: these are the only days this list offers, and accepting anything else here
 * would make the list a suggestion rather than the set it is.
 */
export function notableDay(day: string): NotableDay | null {
  return NOTABLE_DAYS.find((d) => d.day === day) ?? null;
}
