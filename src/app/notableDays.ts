/* Days worth seeing, because the archive's only way in was a blank date field. See ARCHITECTURE.md. */

export interface NotableDay {
  /** The UTC day, which is the span the archive loads. */
  day: string;
  /** What happened, in the fewest words that identify it. */
  what: string;
  /** The largest magnitude the feed returns for that day, as measured. */
  magnitude: number;
}

/* Largest first, because the two M9.1s are the reason to open this at all. See ARCHITECTURE.md. */
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
 * Why the oldest rows look empty. Required rather than decorative: 1960 returns six events and Tōhoku 685,
 * and without this a reader takes a true number as a claim about the planet.
 */
export const NOTABLE_NOTE =
  "Older days hold fewer events: the networks were smaller, not the planet quieter.";

/** The day as the archive wants it, or null when the string is not one of ours. A lookup rather than a
 * parse: accepting anything else would make the list a suggestion rather than the set it is. */
export function notableDay(day: string): NotableDay | null {
  return NOTABLE_DAYS.find((d) => d.day === day) ?? null;
}
