import table from "./regionMax.json";
import { contains, REGIONS } from "./regions";
import type { Quake } from "../data/types";

/*
 * The window's largest against what its region has managed this century.
 *
 * A magnitude alone has no scale beside it: "M6.1, Japan & Kurils" reads as enormous and is an ordinary week
 * there. On the rare day the window clears the record, the app has a real superlative.
 *
 * Say "since at least 2000", because that is where the table starts - Valdivia is not in it.
 *
 * Only inside a named region. Outside the eleven boxes it is mid-ocean, with no local record to compare to.
 */

/** `[magnitude, day]` per region name, as generated. */
type RegionMax = Record<string, readonly [number, string]>;

const RECORDS = table as unknown as RegionMax;

/*
 * Where the generated table begins and ends. Both printed, because the claim is bounded by both. With the
 * end left off, the sentence read "largest in Indonesia since 2000" off a table that stops on 2025-08-01 -
 * a larger event in the gap would make the strongest claim this app makes false, with nothing saying so.
 */
export const SINCE = "2000";
export const UNTIL = "2025";

export interface Superlative {
  region: string;
  /** The region's largest since `SINCE`. */
  record: number;
  /** The day it happened, as `YYYY-MM-DD`. */
  day: string;
  /** True when the event handed in has beaten that record, which is the rare and important case. */
  beaten: boolean;
}

/**
 * The region an event falls in, or null when it is outside all of them. First match wins: the boxes overlap,
 * and the order in `REGIONS` is the preference the rail's counts already follow.
 */
export function regionOf(lon: number, lat: number): string | null {
  for (const region of REGIONS) {
    if (contains(region, lon, lat)) return region.name;
  }
  return null;
}

/**
 * The comparison for one event, or null when there is nothing to compare against. Null for a region with no
 * record in the table, which is better as silence than as a sentence with a hole in it.
 */
export function superlativeFor(
  quake: Quake | null, asOf: number = Date.now(),
): Superlative | null {
  if (quake === null) return null;
  const { lon, lat, magnitude } = quake.primary;
  if (!Number.isFinite(magnitude)) return null;
  const region = regionOf(lon, lat);
  if (region === null) return null;
  const held = RECORDS[region];
  if (!held) return null;
  const [record, day] = held;
  /*
   * Never cite a record that had not happened yet. The table is a maximum over the whole span and knows
   * nothing about the day on screen: loading 2001-06-23 read "Largest in Indonesia since 2000: M9.1,
   * December 2004", offered as context for a day three years before it happened.
   *
   * Comparing against the whole span is still right whenever the record predates the day: if the maximum
   * over 2000 to 2025 fell before that day, nothing between 2000 and it was larger either.
   */
  const happened = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(happened) || happened > asOf) return null;
  return { region, record, day, beaten: magnitude > record };
}

/** `2011-03-11` as `March 2011`, because a record's exact day is not what the sentence is about. */
export function recordWhen(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(at)) return day;
  return new Date(at).toLocaleDateString("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}
