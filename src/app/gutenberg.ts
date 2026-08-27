import type { Store } from "../data/store";
import { matches } from "../data/filter";
import type { Filters } from "../data/types";

/*
 * How the sizes stack up: the one law every earthquake catalogue obeys.
 *
 * Count everything at or above each magnitude, plot the log of that against magnitude, and the points
 * fall on a straight line. Ten times as many, each magnitude down. It is the Gutenberg-Richter relation,
 * it has held since 1944, and this app already holds every number it needs to draw it.
 *
 * **It is the missing half of an argument the app already makes in prose.** The rail says magnitude is
 * logarithmic and that two points of it is a thousand times the energy; this is that sentence as a
 * picture, with today's own events on it, countable against the line.
 *
 * **The bend at the bottom is the interesting part, and it is about us rather than the Earth.** Below
 * some magnitude a catalogue stops hearing everything, so the counts fall short of the line - not because
 * the small earthquakes stopped happening but because the network stopped detecting them. That turn is
 * this app's own detection limit made visible, which is a fact it is otherwise obsessive about stating
 * and has never been able to show.
 *
 * **The b-value is estimated the way seismologists estimate it**, by maximum likelihood rather than by
 * fitting a line through the plotted points. Least squares on cumulative counts weights the rare large
 * events equally with the common small ones and is known to be biased; Aki's estimator uses the mean
 * magnitude above completeness and is one line of arithmetic. The line drawn on the chart is that
 * estimate, so what is plotted and what is quoted cannot disagree.
 */

/** Bin width in magnitude units. 0.1 is the precision the feeds report at. */
const BIN = 0.1;

export interface Sizes {
  /** Cumulative points: how many events were at or above this magnitude. */
  points: { magnitude: number; atOrAbove: number }[];
  /**
   * Where the catalogue stops hearing everything, by maximum curvature.
   *
   * The most populated bin. Below it the counts fall away because of detection rather than because of
   * the Earth, so it is where the fit starts and where the chart says the picture stops being about
   * earthquakes.
   */
  complete: number;
  /**
   * The slope: how many times more numerous each magnitude down is, as a power of ten.
   *
   * Close to 1 nearly everywhere on Earth, which is why "ten times as many, each magnitude down" is a
   * fair way to say it. Null when there is not enough above `complete` to estimate anything.
   */
  b: number | null;
  /** How many events the estimate used, so the panel can refuse to quote a b from six events. */
  used: number;
  /** The largest in the window, which is where the line is drawn to. */
  largest: number;
}

/**
 * The size distribution of everything currently on screen.
 *
 * Reads the same `matches` the globe does, so the chart describes the picture rather than the buffer -
 * the mistake the headline count made for a while, and the one this app treats as a design rule.
 */
export function sizesOf(store: Store, filters: Filters, now: number): Sizes {
  const mags: number[] = [];
  store.forEach((quake) => {
    if (!matches(quake, filters, now)) return;
    const m = quake.primary.magnitude;
    if (Number.isFinite(m)) mags.push(m);
  });

  if (mags.length === 0) {
    return { points: [], complete: 0, b: null, used: 0, largest: 0 };
  }
  mags.sort((a, b) => a - b);
  const largest = mags[mags.length - 1]!;
  const smallest = mags[0]!;

  /*
   * Non-cumulative counts first, because completeness is about which bin is fullest.
   *
   * Rounded to the bin rather than floored: a magnitude reported as 4.5 belongs in the 4.5 bin, and
   * flooring would push every value reported at exactly a bin edge one step down.
   */
  const tally = new Map<number, number>();
  for (const m of mags) {
    const bin = Math.round(m / BIN) * BIN;
    tally.set(bin, (tally.get(bin) ?? 0) + 1);
  }
  let complete = smallest;
  let best = -1;
  for (const [bin, n] of tally) {
    if (n > best || (n === best && bin < complete)) {
      best = n;
      complete = bin;
    }
  }

  // The cumulative curve, which is what gets plotted.
  const points: { magnitude: number; atOrAbove: number }[] = [];
  for (let bin = Math.round(smallest / BIN) * BIN; bin <= largest + BIN / 2; bin += BIN) {
    const at = Math.round(bin * 10) / 10;
    const atOrAbove = mags.length - lowerBound(mags, at - BIN / 2);
    if (atOrAbove > 0) points.push({ magnitude: at, atOrAbove });
  }

  /*
   * Aki's maximum-likelihood estimator, on everything at or above completeness.
   *
   * `complete - BIN / 2` is the true lower edge of that bin: the estimator wants the distance from the
   * smallest magnitude the sample could contain, not from the centre of its bin, and using the centre
   * biases b upward by a few percent.
   */
  const above = mags.filter((m) => m >= complete - BIN / 2);
  const used = above.length;
  let b: number | null = null;
  if (used >= 20) {
    const mean = above.reduce((s, m) => s + m, 0) / used;
    const spread = mean - (complete - BIN / 2);
    if (spread > 1e-6) b = Math.LOG10E / spread;
  }
  return { points, complete: Math.round(complete * 10) / 10, b, used, largest };
}

/** First index whose value is at least `target`, in a sorted array. */
function lowerBound(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The line the estimate draws, as two endpoints in plot space.
 *
 * Anchored on the count at completeness rather than fitted independently, so the line passes through the
 * data it was estimated from instead of floating beside it.
 */
export function fitLine(sizes: Sizes): { from: [number, number]; to: [number, number] } | null {
  if (sizes.b === null) return null;
  const anchor = sizes.points.find((p) => Math.abs(p.magnitude - sizes.complete) < BIN / 2);
  if (!anchor) return null;
  const logAt = Math.log10(anchor.atOrAbove);
  const end = sizes.largest;
  return {
    from: [sizes.complete, logAt],
    to: [end, logAt - sizes.b * (end - sizes.complete)],
  };
}
