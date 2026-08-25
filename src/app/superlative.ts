import table from "./regionMax.json";
import { contains, REGIONS } from "./regions";
import type { Quake } from "../data/types";

/*
 * Where the window's largest sits against what its region is capable of.
 *
 * The rail names the biggest event and its magnitude, and a magnitude on its own is the thing this app
 * refuses everywhere else: a number with no scale beside it. "M6.1, Japan & Kurils" reads as enormous to
 * anybody who has not spent time with the scale, and it is an ordinary week there. The region's own
 * ceiling is the shortest way to say so.
 *
 * **Two sentences, and only one of them is rare.** Most days this states the ceiling and lets the reader
 * do the comparison. On the day the window's largest clears that ceiling it becomes a superlative, which is
 * the strongest thing this app will ever have to say - and it can say it because the number came from the
 * catalogue rather than from an impression.
 *
 * **"Since at least 2000", because that is where the table starts.** The catalogue reaches further back and
 * `tools/make-region-max.mjs` does not, so a region's true maximum may be older and larger: Valdivia is
 * not in here and neither is Prince William Sound. Bounding the claim costs two words and is the whole
 * difference between a fact and an overstatement.
 *
 * **Only inside a named region.** Most of the seismicity on this globe is in one of the eleven boxes the
 * rail already counts by, and the rest is mid-ocean, where there is no meaningful local record to compare
 * against. Outside them this says nothing, which is the same choice every other note here makes.
 */

/** `[magnitude, day]` per region name, as generated. */
type RegionMax = Record<string, readonly [number, string]>;

const RECORDS = table as unknown as RegionMax;

/** Where the generated table begins. Printed, because the claim is bounded by it. */
export const SINCE = "2000";

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
 * The region an event falls in, or null when it is outside all of them.
 *
 * First match wins. The boxes overlap - Tonga & Kermadec and Alaska & Aleutians both reach the date line -
 * and the order in `REGIONS` is the app's existing preference, which the rail's counts already follow.
 */
export function regionOf(lon: number, lat: number): string | null {
  for (const region of REGIONS) {
    if (contains(region, lon, lat)) return region.name;
  }
  return null;
}

/**
 * The comparison for one event, or null when there is nothing to compare it against.
 *
 * Null outside a named region, and null for a region with no record in the table - which happens only if
 * the generator is rerun with a threshold high enough to miss one, and is better as silence than as a
 * sentence with a hole in it.
 */
export function superlativeFor(quake: Quake | null): Superlative | null {
  if (quake === null) return null;
  const { lon, lat, magnitude } = quake.primary;
  if (!Number.isFinite(magnitude)) return null;
  const region = regionOf(lon, lat);
  if (region === null) return null;
  const held = RECORDS[region];
  if (!held) return null;
  const [record, day] = held;
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
