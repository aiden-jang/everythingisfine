import { passesMagnitude, passesSource } from "../data/filter";
import type { Filters, Quake } from "../data/types";

/*
 * The window as 24 bars.
 *
 * The globe answers "where" completely and "when" not at all. Every event on it is drawn the same
 * whether it happened four minutes ago or nineteen hours ago, which means the one thing a seismic
 * sequence actually is, a shape in time, was the one thing the app could not show. Four hundred
 * events in the Flores Sea collapsed to a handful of markers and there was nowhere to see that
 * three hundred of them arrived inside ninety minutes.
 *
 * Twenty-four bars of whatever the window divides into, rather than twenty-four hours.
 *
 * The strip used to be a day, always, with a slider on it selecting a sub-range to show. That made
 * the strip and the globe disagree by design: the bars showed a day and the globe showed the part
 * the slider had kept. Fixing the bucket to an hour also put a ceiling on the window, because a
 * month of hourly bars is seven hundred and twenty of them in two hundred pixels.
 *
 * So the window is chosen by name and the strip is always exactly it. A day buckets into hours, a
 * week into seven-hour blocks, a month into thirty-hour ones, and the geometry, the square-root
 * scaling and the cursor's fraction all carry over untouched because the count never changes.
 */

/** Bars across the strip, whatever the window. Keeps the strip's geometry independent of its span. */
export const BUCKETS = 24;

export interface Bar {
  /** Whole buckets before now. 0 is the bucket ending now, 23 is the oldest. */
  bucketsAgo: number;
  count: number;
  /** Strongest magnitude in the bucket, or null when nothing is in it. */
  peak: number | null;
  /**
   * Whether the buffer covered this whole bucket.
   *
   * With no backend the buffer starts when the page opens, so most of the strip is time the app never
   * saw. An unobserved bucket drawn as an empty one is the app claiming a quiet night it was not
   * present for, which is the same lie `windowStart` exists to prevent.
   */
  observed: boolean;
}

export interface Activity {
  bars: Bar[];
  /**
   * The strongest event in the window, or null when there is none.
   *
   * Returned from here rather than found separately because this already walks every event in the
   * buffer, and the alternative is a second full pass to answer a one-line question.
   */
  strongest: Quake | null;
  /** How long one bar covers, so a caller can label the axis without redoing the division. */
  bucketMs: number;
  /**
   * The strongest event's share of all the energy released in the window, or null when nothing passes.
   *
   * Here for the same reason `strongest` is: this walk already visits every event, and the ratio wants
   * a sum over all of them. It exists because magnitude is logarithmic and almost nobody carries that
   * around: two points of magnitude is a thousandfold of energy, so one large event routinely accounts
   * for better than 99 percent of a month, and a number that high is the fact doing the teaching.
   */
  energyShare: number | null;
  /**
   * Events inside the span both feeds cover, and how many of them both feeds reported.
   *
   * The header prints a bare `both` count, and a bare count invites the window's total as its
   * denominator. At a month that is a lie by a factor of fifty-five: measured against the live feeds,
   * corroboration reads as 0.9 percent of a 30-day window and is 49.5 percent inside the 21 hours EMSC
   * actually reaches. The project's whole subject is two agencies reporting one earthquake, and its own
   * headline number was understating it by that much.
   *
   * Null when the two feeds have no overlap to speak of, which is a different statement from zero.
   */
  overlap: { events: number; both: number } | null;
}

/**
 * Energy, proportional and not in joules.
 *
 * The Gutenberg-Richter relation is log E = 1.5M + 4.8 for joules, and the constant is dropped because
 * every use of this is a ratio, where it cancels. Keeping it would put a figure like 4e9 joules on
 * screen, which reads as a measurement of one earthquake's energy budget, and radiated seismic energy
 * from a magnitude is an estimate with a wide error bar rather than a reading.
 */
export const energyOf = (magnitude: number): number => 10 ** (1.5 * magnitude);

/**
 * Bars oldest first, so the array reads left to right as the axis does.
 *
 * Takes the store's `forEach` rather than an array. A day is on the order of a thousand events, a
 * month is ten thousand, and this runs on every revision; copying the buffer out to count it would be
 * the most expensive thing in the frame for no reason.
 */
export function histogram(
  forEach: (fn: (quake: Quake) => void) => void,
  filters: Filters,
  now: number,
  since: number | null,
  /** Start of the span both feeds vouch for, or null when they do not overlap. */
  overlapFrom: number | null = null,
): Activity {
  const bucketMs = Math.max(1, filters.windowMs / BUCKETS);
  const counts = new Array<number>(BUCKETS).fill(0);
  const peaks = new Array<number | null>(BUCKETS).fill(null);
  let strongest: Quake | null = null;
  let energyTotal = 0;
  // The winner's magnitude, tracked beside it, because the share needs the number and not the event.
  // Reading it back off `strongest` after the walk is also what TypeScript will not allow: it cannot
  // see that the callback ran, so it narrows the variable to null and the dereference is an error.
  let topMagnitude = Number.NEGATIVE_INFINITY;
  // Counted in the walk that is already happening, like the energy share beside it.
  let inOverlap = 0;
  let bothInOverlap = 0;

  forEach((quake) => {
    if (!passesMagnitude(quake, filters.minMagnitude)) return;
    if (!passesSource(quake, filters.sources)) return;
    // Origin time, not arrival: an event that reached us thirty seconds ago but happened twenty
    // minutes ago belongs twenty minutes back on this strip. Same reasoning as `passesWindow`.
    const bucketsAgo = Math.floor((now - quake.primary.time) / bucketMs);
    if (bucketsAgo >= BUCKETS) return;
    /*
     * A future origin time lands in the current bucket rather than being dropped.
     *
     * Agencies and browsers disagree about the clock by a second or two, so an event published the
     * moment it happened can arrive stamped slightly ahead of `now`. The window filter accepts it,
     * the globe draws it, and dropping it here would make these counts disagree with the picture
     * they are supposed to be totalling.
     */
    const bucket = Math.max(0, bucketsAgo);
    counts[bucket] += 1;
    const m = quake.primary.magnitude;
    if (peaks[bucket] === null || m > peaks[bucket]!) peaks[bucket] = m;
    if (strongest === null || m > strongest.primary.magnitude) {
      strongest = quake;
      topMagnitude = m;
    }
    energyTotal += energyOf(m);
    if (overlapFrom !== null && quake.primary.time >= overlapFrom) {
      inOverlap += 1;
      // More than one reading means more than one agency: the store keeps at most one per source.
      if (quake.readings.length > 1) bothInOverlap += 1;
    }
  });

  const bars = Array.from({ length: BUCKETS }, (_, i) => {
    const bucketsAgo = BUCKETS - 1 - i;
    // The span this bar covers, as [start, end).
    const start = now - (bucketsAgo + 1) * bucketMs;
    return {
      bucketsAgo,
      count: counts[bucketsAgo]!,
      peak: peaks[bucketsAgo]!,
      /*
       * The bar straddling the moment the page opened counts as unobserved.
       *
       * It holds real events and its number is still wrong, because the app was absent for part of
       * the span it claims to total. Of the two available errors, showing a number that is too low
       * and admitting the span is incomplete, the second is the one this app makes everywhere else.
       */
      observed: since !== null && since <= start,
    };
  });

  /*
   * One division at the end, rather than a share maintained through the walk.
   *
   * The strongest event changes during the pass, so an incremental share would have to be recomputed
   * every time it did. This cannot go out of step with the winner.
   */
  const energyShare = energyTotal > 0 && Number.isFinite(topMagnitude)
    ? energyOf(topMagnitude) / energyTotal
    : null;

  return {
    bars,
    strongest,
    bucketMs,
    energyShare,
    overlap: overlapFrom === null ? null : { events: inOverlap, both: bothInOverlap },
  };
}

/** The tallest bar, for scaling. Zero when nothing passes, which callers must not divide by. */
export const peakCount = (bars: Bar[]): number =>
  bars.reduce((max, b) => Math.max(max, b.count), 0);

/**
 * How many events are inside the window, which is exactly what the globe is drawing.
 *
 * Derived from the bars rather than counted again. The strip has already applied magnitude and source
 * to every event in the buffer and split them by bucket, and the strip now spans exactly the window,
 * so the total across it is the same predicate `matches` applies, arrived at without a second walk.
 */
export const totalIn = (bars: Bar[]): number =>
  bars.reduce((total, b) => total + b.count, 0);
