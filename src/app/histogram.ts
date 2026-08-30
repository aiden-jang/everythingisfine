import { passesMagnitude, passesSource } from "../data/filter";
import type { Filters, Quake } from "../data/types";

/* The window as 24 bars, so the globe can answer "when" as well as "where". See ARCHITECTURE.md. */

/** Bars across the strip, whatever the window. Keeps the strip's geometry independent of its span. */
export const BUCKETS = 24;

export interface Bar {
  /** Whole buckets before now. 0 is the bucket ending now, 23 is the oldest. */
  bucketsAgo: number;
  count: number;
  /** Strongest magnitude in the bucket, or null when nothing is in it. */
  peak: number | null;
  /** The event behind that peak, or null on an empty bucket. `position` is a fraction of the window, 0 at
   * the old edge, so a tick sits over the moment rather than the middle of its bucket. */
  lead: { key: string; magnitude: number; position: number } | null;
  /** Whether the buffer covered this whole bucket. With no backend the buffer starts when the page opens,
   * so most of the strip is time the app never saw, and drawing that as an empty bucket claims a quiet
   * night it was not present for. */
  observed: boolean;
}

export interface Activity {
  bars: Bar[];
  /** The strongest event in the window, or null. Returned from here because this already walks every
   * event in the buffer, and the alternative is a second full pass for a one-line question. */
  strongest: Quake | null;
  /** How long one bar covers, so a caller can label the axis without redoing the division. */
  bucketMs: number;
  /**
   * The strongest event's share of all the energy released in the window. Here for the same reason
   * `strongest` is. It exists because magnitude is logarithmic and almost nobody carries that around: two
   * points is a thousandfold of energy, so one large event routinely accounts for 99 percent of a month.
   */
  energyShare: number | null;
  /** The sum of `energyOf` over every event in the window, in the same arbitrary units. Not joules, on
   * purpose - see `energyOf` - so the only honest thing to do with it is compare it against another
   * number from the same function. */
  energyTotal: number;
  /**
   * Events inside the span both feeds cover, and how many of them both feeds reported. See
   * ARCHITECTURE.md.
   */
  overlap: { events: number; both: number } | null;
}

/**
 * Energy, proportional and not in joules. Gutenberg-Richter is log E = 1.5M + 4.8, and the constant is
 * dropped because every use here is a ratio. Keeping it would print "4e9 joules", which reads as a
 * measurement when radiated energy from a magnitude is an estimate with a wide error bar.
 */
export const energyOf = (magnitude: number): number => 10 ** (1.5 * magnitude);

/**
 * Bars oldest first, so the array reads left to right as the axis does. Takes the store's `forEach` rather
 * than an array: a month is ten thousand events and this runs on every revision, so copying the buffer out
 * to count it would be the most expensive thing in the frame.
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
  const leaders = new Array<Quake | null>(BUCKETS).fill(null);
  let strongest: Quake | null = null;
  let energyTotal = 0;
  // The winner's magnitude, tracked beside it, because the share needs the number and not the event.
  // Reading it back off `strongest` afterwards is also what TypeScript will not allow: it cannot see that
  // the callback ran, so it narrows to null.
  let topMagnitude = Number.NEGATIVE_INFINITY;
  // Counted in the walk that is already happening, like the energy share beside it.
  let inOverlap = 0;
  let bothInOverlap = 0;

  forEach((quake) => {
    if (!passesMagnitude(quake, filters.minMagnitude)) return;
    if (!passesSource(quake, filters.sources)) return;
    // Origin time, not arrival: an event that reached us thirty seconds ago but happened twenty minutes
    // ago belongs twenty minutes back on this strip.
    const bucketsAgo = Math.floor((now - quake.primary.time) / bucketMs);
    if (bucketsAgo >= BUCKETS) return;
    /*
     * A future origin time lands in the current bucket rather than being dropped. Agencies and browsers
     * disagree about the clock by a second or two, and the window filter accepts such an event, so
     * dropping it here would make these counts disagree with the picture they are totalling.
     */
    const bucket = Math.max(0, bucketsAgo);
    counts[bucket] += 1;
    const m = quake.primary.magnitude;
    if (peaks[bucket] === null || m > peaks[bucket]!) { peaks[bucket] = m; leaders[bucket] = quake; }
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
    const lead = leaders[bucketsAgo] ?? null;
    return {
      bucketsAgo,
      count: counts[bucketsAgo]!,
      peak: peaks[bucketsAgo]!,
      lead: lead === null ? null : {
        key: lead.key,
        magnitude: lead.primary.magnitude,
        // Clamped: an origin time a second in the future would otherwise place a tick past the edge.
        position: Math.max(0, Math.min(1, 1 - (now - lead.primary.time) / filters.windowMs)),
      },
      /*
       * The bar straddling the moment the page opened counts as unobserved. It holds real events and its
       * number is still wrong, because the app was absent for part of the span it claims to total.
       */
      observed: since !== null && since <= start,
    };
  });

  // One division at the end rather than a share maintained through the walk: the strongest event changes
  // during the pass, so an incremental share would have to be recomputed every time it did.
  const energyShare = energyTotal > 0 && Number.isFinite(topMagnitude)
    ? energyOf(topMagnitude) / energyTotal
    : null;

  return {
    bars,
    strongest,
    bucketMs,
    energyShare,
    energyTotal,
    overlap: overlapFrom === null ? null : { events: inOverlap, both: bothInOverlap },
  };
}

/** The tallest bar, for scaling. Zero when nothing passes, which callers must not divide by. */
export const peakCount = (bars: Bar[]): number =>
  bars.reduce((max, b) => Math.max(max, b.count), 0);

/**
 * How many events are inside the window, which is exactly what the globe is drawing. Derived from the bars
 * rather than counted again: the strip has already applied magnitude and source to every event and now
 * spans exactly the window, so the total across it is the same predicate `matches` applies.
 */
export const totalIn = (bars: Bar[]): number =>
  bars.reduce((total, b) => total + b.count, 0);
