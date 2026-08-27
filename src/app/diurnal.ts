import { matches } from "../data/filter";
import { solarHour } from "../geo/sun";
import type { Filters, Quake } from "../data/types";

/*
 * The window folded onto a 24-hour dial, which is worth drawing because it shows nothing.
 *
 * Almost everything anybody counts has a time of day in it: traffic, births, crime, power draw. Earthquakes
 * do not. A dial that comes out flat says that more convincingly than a sentence claiming it.
 *
 * Local solar time at each epicentre, not UTC. A real diurnal signal would be driven by the sun, so binning
 * on UTC would smear it across every longitude and flatten it by construction.
 *
 * The noise band is not decoration. 400 events into 24 bins is 17 apiece and a Poisson scatter of 4, and
 * bars wobbling by a quarter look exactly like a signal. So the expected scatter is drawn, and a narrow
 * window announces its own weakness by having a wide band.
 *
 * No verdict is printed. With 24 bins, roughly one strays past two sigma by luck alone, so an app declaring
 * "no signal" off that threshold would be wrong about a third of the time.
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
 * The dial's own finding, as a sentence, or null when there is nothing to report.
 *
 * `worst` was computed and tested and never drawn, so the one number the picture is about reached nobody who
 * could not read a ring against a band - and nobody at all through a screen reader, since the drawing is not
 * in the accessibility tree.
 *
 * A number and no verdict. With 24 bins roughly one strays past two sigma by luck, so an app declaring "no
 * signal" off that threshold would be wrong about a third of the time. Stating the departure and the band it
 * is measured against is the same move `data/depth.ts` makes: print the number that says whether the reader
 * can see the thing, rather than the claim that they will.
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
