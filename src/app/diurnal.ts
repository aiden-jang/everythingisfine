import { matches } from "../data/filter";
import { solarHour } from "../geo/sun";
import type { Filters, Quake } from "../data/types";

/*
 * The window folded onto a 24-hour dial, which is worth drawing because it shows nothing.
 *
 * Almost everything anybody counts has a time of day in it: traffic, births, crime, power draw, calls
 * to a helpdesk. Earthquakes do not. The Earth does not know what time it is, and a dial that comes out
 * flat says that more convincingly than a sentence claiming it, because the reader watches the null
 * result fail to appear.
 *
 * **Local solar time at each epicentre, not UTC.** A real diurnal signal would be driven by the sun, so
 * binning on UTC would smear it across every longitude and flatten it by construction: the dial would
 * come out flat whether or not there was anything there, which is the one outcome that would make it
 * worthless. This is why solar time was built first.
 *
 * **The noise band is not decoration.** Counting 400 events into 24 bins gives 17 apiece and a Poisson
 * scatter of 4, which is 25 percent, and bars wobbling by a quarter look exactly like a signal to
 * anybody not holding the arithmetic. At a month it is 4.5 percent and genuinely flat. So the expected
 * scatter is drawn, the reader sees the test get stronger as the window widens, and a narrow window
 * announces its own weakness by having a wide band.
 *
 * **No verdict is printed.** `Sequence.tsx` refuses to call an event an aftershock on the grounds that
 * the judgement is the reader's, and the same applies here with a statistical trap attached: with 24
 * bins, roughly one will stray past two sigma by luck alone, so an app declaring "no signal" or "a
 * signal" off that threshold would be wrong about a third of the time. It draws the bars and the band.
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
 * Counts by local solar hour, in one pass.
 *
 * `subsolarPoint` per event, uncached, and that is measured rather than assumed: 50,000 calls cost
 * 10.8ms, and caching them by UTC minute cost 14.1ms because at a month's window almost every event
 * falls in a minute of its own and the map is pure overhead. The obvious optimisation made it slower.
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
   * Poisson, and deliberately the conservative choice.
   *
   * A fixed total makes these bins multinomial, whose variance is mean times 23/24, so the true
   * scatter is two percent narrower than this. Overstating the noise by two percent errs toward
   * calling a real signal nothing, which is the direction an app showing a null result should err in.
   */
  const sigma = Math.sqrt(mean);
  const worst = sigma > 0
    ? counts.reduce((max, n) => Math.max(max, Math.abs(n - mean) / sigma), 0)
    : 0;

  return { counts, total, mean, sigma, worst };
}

/**
 * How far a bin sits from an even spread, in sigmas, clamped for drawing.
 *
 * The radial axis carries this rather than the count, and that is the difference between a chart and a
 * decoration. Drawn from zero, the 4.5 percent variation a month produces is under two pixels on a
 * forty pixel bar, so the dial would come out a smooth ring whether the data were flat or carried a ten
 * percent signal. Plotting the departure makes the thing being asked about the thing being drawn.
 */
export function departure(count: number, mean: number, sigma: number, limit = 3): number {
  if (!Number.isFinite(sigma) || sigma <= 0) return 0;
  const z = (count - mean) / sigma;
  return Math.max(-limit, Math.min(limit, z));
}

/**
 * A point on the dial, for an hour and a radius.
 *
 * Midnight at the top and the hours running clockwise, like a clock, because a 24-hour dial that ran
 * the other way would be technically arbitrary and read as broken. Each bin is drawn at its own centre,
 * so hour 0 sits at the top rather than starting there.
 */
export function dialPoint(hour: number, radius: number): { x: number; y: number } {
  const angle = ((hour + 0.5) / BINS) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
