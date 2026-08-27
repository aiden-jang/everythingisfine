import { matches } from "../data/filter";
import { solarHour } from "../geo/sun";
import type { Filters, Quake } from "../data/types";

/*
 * Counts events by hour of day, on a 24-hour dial. Earthquakes have no time of day, so this shows nothing.
 *
 * Bin on solar time at each epicentre, never UTC. UTC smears a real signal across every longitude and
 * flattens it, so the dial would come out flat whether or not anything was there.
 *
 * Draw the noise band: 400 events in 24 bins is 17 each give or take 4, and bars wobbling by a quarter look
 * like a signal. Never print a verdict - with 24 bins, one strays past two sigma by luck alone.
 */

export const BINS = 24;

export interface Diurnal {
  /** Events per hour of local solar time, index 0 being midnight to one. */
  counts: number[];
  total: number;
  /** What each bin would hold if the hours were even. */
  mean: number;
  /** Expected scatter from counting alone. */
  sigma: number;
  /** The largest departure from the mean, in units of sigma. */
  worst: number;
}

/**
 * Counts by local solar hour, in one pass. `subsolarPoint` per event, uncached, and that is measured:
 * 50,000 calls cost 10.8ms, and caching by UTC minute cost 14.1ms, because at a month almost every event
 * falls in a minute of its own. The obvious optimisation made it slower.
 */
export function diurnal(
  forEach: (fn: (quake: Quake) => void) => void, filters: Filters, now: number,
): Diurnal {
  const counts = new Array<number>(BINS).fill(0);
  let total = 0;

  forEach((quake) => {
    if (!matches(quake, filters, now)) return;
    const r = quake.primary;
    const hour = solarHour(r.lon, r.time);
    // `solarHour` returns [0, 24), so the floor is in range; the min is for the float edge case where
    // 23.9999999 rounds its way to 24 inside the division.
    const bin = Math.min(BINS - 1, Math.floor(hour));
    counts[bin] += 1;
    total += 1;
  });

  const mean = total / BINS;
  /*
   * Poisson, and deliberately the conservative choice. A fixed total makes these bins multinomial, whose
   * variance is mean times 23/24, so the true scatter is two percent narrower. Overstating the noise errs
   * toward calling a real signal nothing, which is the direction an app showing a null result should err in.
   */
  const sigma = Math.sqrt(mean);
  const worst = sigma > 0
    ? counts.reduce((max, n) => Math.max(max, Math.abs(n - mean) / sigma), 0)
    : 0;

  return { counts, total, mean, sigma, worst };
}

/**
 * The dial's finding, as a number, or null when there is none.
 *
 * Say the number. `worst` was computed and tested and never drawn, so it reached nobody who could not read a
 * ring against a band by eye, and nobody at all through a screen reader.
 *
 * A number and no word. With 24 bins one strays past two sigma by luck, so any verdict is wrong a third of
 * the time.
 */
export function worstNote(d: Diurnal): string | null {
  if (!Number.isFinite(d.worst) || d.sigma <= 0) return null;
  return `${d.worst.toFixed(1)}`;
}

/**
 * How far a bin sits from an even spread, in sigmas, clamped for drawing. The radial axis carries this
 * rather than the count, which is the difference between a chart and a decoration: drawn from zero, a
 * month's 4.5 percent variation is under two pixels on a forty pixel bar.
 */
export function departure(count: number, mean: number, sigma: number, limit = 3): number {
  if (!Number.isFinite(sigma) || sigma <= 0) return 0;
  const z = (count - mean) / sigma;
  return Math.max(-limit, Math.min(limit, z));
}

/**
 * A point on the dial, for an hour and a radius. Midnight at the top and the hours clockwise, like a clock,
 * because a 24-hour dial running the other way reads as broken. Each bin is drawn at its own centre.
 */
export function dialPoint(hour: number, radius: number): { x: number; y: number } {
  const angle = ((hour + 0.5) / BINS) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
