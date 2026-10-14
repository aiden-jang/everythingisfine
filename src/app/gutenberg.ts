import type { Store } from "../data/store";
import { matches } from "../data/filter";
import type { Filters } from "../data/types";

/* How many earthquakes there are at each size. Ten times as many, each magnitude down, since 1944. See ARCHITECTURE.md#srcappgutenbergts. */

/** Bin width in magnitude units. 0.1 is the precision the feeds report at. */
const BIN = 0.1;

export interface Sizes {
  /** Cumulative points: how many events were at or above this magnitude. */
  points: { magnitude: number; atOrAbove: number }[];
  /** Where the catalogue stops hearing everything: the most populated bin. Below it the counts fall away
   * because of detection rather than because of the Earth. */
  complete: number;
  /** The slope: how many times more numerous each magnitude down is, as a power of ten. Close to 1 nearly
   * everywhere on Earth. Null when there is not enough above `complete` to estimate anything. */
  b: number | null;
  /** How many events the estimate used, so the panel can refuse to quote a b from six events. */
  used: number;
  /** The largest in the window, which is where the line is drawn to. */
  largest: number;
}

/**
 * The size distribution of everything currently on screen. Reads the same `matches` the globe does, so the
 * chart describes the picture rather than the buffer.
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

  // Non-cumulative counts first, because completeness is about which bin is fullest. Rounded to the bin
  // rather than floored: flooring would push every value reported at exactly a bin edge one step down.
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

  // Aki's maximum-likelihood estimator. `complete - BIN / 2` is the true lower edge of that bin: the
  // estimator wants the distance from the smallest magnitude the sample could contain, and using the bin
  // centre biases b upward by a few percent.
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
 * The line the estimate draws, as two endpoints in plot space. Anchored on the count at completeness rather
 * than fitted independently, so the line passes through the data it was estimated from.
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
