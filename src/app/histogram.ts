import { passesMagnitude, passesSource } from "../data/filter";
import type { Filters, Quake } from "../data/types";

/*
 * The last day as 24 bars.
 *
 * The globe answers "where" completely and "when" not at all. Every event on it is drawn the same
 * whether it happened four minutes ago or nineteen hours ago, which means the one thing a seismic
 * sequence actually is, a shape in time, was the one thing the app could not show. Four hundred
 * events in the Flores Sea collapsed to a handful of markers and there was nowhere to see that
 * three hundred of them arrived inside ninety minutes.
 *
 * It is also the missing half of a filter that already existed. `windowMs` was enforced in
 * `matches`, encoded in permalinks and clamped on the way back in, and no control anywhere could
 * change it: a link could carry `w=6` and nobody could produce one.
 */

export const HOURS = 24;
const HOUR_MS = 3_600_000;

export interface Bar {
  /** Whole hours before `now`. 0 is the hour ending now, 23 is the oldest. */
  hoursAgo: number;
  count: number;
  /** Strongest magnitude in the hour, or null when nothing is in it. */
  peak: number | null;
  /**
   * Whether the buffer covered this whole hour.
   *
   * With no backend the buffer starts when the page opens, so most of the strip is a day the app
   * never saw. An unobserved hour drawn as an empty hour is the app claiming a quiet night it was
   * not present for, which is the same lie `windowStart` exists to prevent.
   */
  observed: boolean;
}

/**
 * Bars oldest first, so the array reads left to right as the axis does.
 *
 * Filtered by magnitude and source but **not by the window**, deliberately: the window is what this
 * strip sets, and a control that hides the thing it is about to select is unusable. Dimming the
 * excluded hours in place keeps the day whole while showing exactly what has been cut, the same way
 * the magnitude track dims rather than shortens.
 *
 * Takes the store's `forEach` rather than an array. A day is on the order of a thousand events and
 * this runs on every revision; copying the buffer out to count it would be the most expensive thing
 * in the frame for no reason.
 */
export interface Activity {
  bars: Bar[];
  /**
   * The strongest event in the window, or null when there is none.
   *
   * Returned from here rather than found separately because this already walks every event in the
   * buffer, and the alternative is a second full pass to answer a one-line question.
   */
  strongest: Quake | null;
}

export function histogram(
  forEach: (fn: (quake: Quake) => void) => void,
  filters: Filters,
  now: number,
  since: number | null,
): Activity {
  const counts = new Array<number>(HOURS).fill(0);
  const peaks = new Array<number | null>(HOURS).fill(null);
  let strongest: Quake | null = null;

  forEach((quake) => {
    if (!passesMagnitude(quake, filters.minMagnitude)) return;
    if (!passesSource(quake, filters.sources)) return;
    // Origin time, not arrival: an event that reached us thirty seconds ago but happened twenty
    // minutes ago belongs twenty minutes back on this strip. Same reasoning as `passesWindow`.
    const hoursAgo = Math.floor((now - quake.primary.time) / HOUR_MS);
    if (hoursAgo >= HOURS) return;
    /*
     * A future origin time lands in the current hour rather than being dropped.
     *
     * Agencies and browsers disagree about the clock by a second or two, so an event published the
     * moment it happened can arrive stamped slightly ahead of `now`. The window filter accepts it,
     * the globe draws it, and dropping it here would make these counts disagree with the picture
     * they are supposed to be totalling.
     */
    const bucket = Math.max(0, hoursAgo);
    counts[bucket] += 1;
    const m = quake.primary.magnitude;
    if (peaks[bucket] === null || m > peaks[bucket]!) peaks[bucket] = m;
    if (strongest === null || m > strongest.primary.magnitude) strongest = quake;
  });

  const bars = Array.from({ length: HOURS }, (_, i) => {
    const hoursAgo = HOURS - 1 - i;
    // The hour this bar covers, as [start, end).
    const start = now - (hoursAgo + 1) * HOUR_MS;
    return {
      hoursAgo,
      count: counts[hoursAgo]!,
      peak: peaks[hoursAgo]!,
      /*
       * The bar straddling the moment the page opened counts as unobserved.
       *
       * It holds real events and its number is still wrong, because the app was absent for part of
       * the hour it claims to total. Of the two available errors, showing a number that is too low
       * and admitting the hour is incomplete, the second is the one this app makes everywhere else.
       */
      observed: since !== null && since <= start,
    };
  });

  return { bars, strongest };
}

/** The tallest bar, for scaling. Zero when nothing passes, which callers must not divide by. */
export const peakCount = (bars: Bar[]): number =>
  bars.reduce((max, b) => Math.max(max, b.count), 0);

/**
 * How many events are inside the window, which is exactly what the globe is drawing.
 *
 * Derived from the bars rather than counted again. The strip has already applied magnitude and
 * source to every event in the buffer and split them by hour, so selecting the hours inside the
 * window is the same predicate `matches` applies, arrived at without a second walk.
 */
export const countWithin = (bars: Bar[], hours: number): number =>
  bars.reduce((total, b) => (b.hoursAgo < hours ? total + b.count : total), 0);
