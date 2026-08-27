import counts from "./baseline.json";
import type { Store } from "./store";

/*
 * Whether today is a lot.
 *
 * The headline says "400 in the last 24 hours" and nothing said whether that is busy, quiet or average.
 * `tools/make-baseline.mjs` counts every UTC day in five years: 1,826 days, quietest 3, median 18, busiest 422.
 *
 * The comparison runs at magnitude 4.5, not at whatever the filter says. A count of everything cannot be
 * compared across years, because how many small events are detected depends on how many seismometers are
 * near them. At 4.5 the global catalogue is complete, so a difference between two days is the planet.
 *
 * So the sentence states its own threshold. It has to: it reports on a population the map may not be drawing.
 */

/** Sorted ascending. See the note in the generator on why that is the entire structure. */
const DAYS = counts as number[];

export const BASELINE_FROM = "2020";
export const BASELINE_TO = "2025";
export const BASELINE_MIN_MAGNITUDE = 4.5;
/** Stated in the sentence, because "of days" is meaningless without knowing how many there were. */
export const BASELINE_DAYS = DAYS.length;

export interface DayRank {
  /** Share of baseline days on the stated side of today, 0 to 1. */
  share: number;
  /** Which side. `quieter` means most days had more than today. */
  direction: "quieter" | "busier";
  /** What today was counted as, so the sentence can print it. */
  count: number;
}

/**
 * How many of the baseline days were strictly busier, and how many strictly quieter. Strict on both sides,
 * so ties belong to neither: with integer counts and a median of 18 there are a lot of ties, and folding
 * them into one side lets the same day read as quieter than 61% or 68% depending on the inequality.
 */
function split(count: number): { quieter: number; busier: number } {
  let lo = 0;
  let hi = DAYS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (DAYS[mid]! < count) lo = mid + 1;
    else hi = mid;
  }
  const quieter = lo;
  let end = lo;
  while (end < DAYS.length && DAYS[end] === count) end += 1;
  return { quieter, busier: DAYS.length - end };
}

/**
 * Today against the five years, or null when there is nothing worth saying. Null rather than a share while
 * the day is still filling: a partial day compared against whole ones would say "quieter than 94% of days"
 * at nine every morning.
 */
export function rankDay(count: number, complete: boolean): DayRank | null {
  if (!complete || !Number.isFinite(count) || count < 0) return null;
  const { quieter, busier } = split(count);
  return busier >= quieter
    ? { share: busier / DAYS.length, direction: "quieter", count }
    : { share: quieter / DAYS.length, direction: "busier", count };
}

/**
 * The share as a whole percent, without rounding into a claim the data does not support. Five events once
 * ranked as "quieter than 100% of the 1,826 days since 2020", which is false - the quietest day had three.
 * The share was 99.945% and `Math.round` turned a true number into an untrue sentence.
 */
export function sharePercent(share: number): number {
  const whole = Math.round(share * 100);
  if (share >= 1) return 100;
  if (share <= 0) return 0;
  return Math.min(99, Math.max(1, whole));
}

/**
 * How many held events are comparable to the baseline: strong enough, and inside the window. Counted from
 * the store rather than the drawn subset, so it means the same thing every time it is printed.
 */
export function comparableCount(store: Store, from: number, to: number): number {
  let n = 0;
  store.forEach((quake) => {
    const { time, magnitude } = quake.primary;
    if (time < from || time > to) return;
    if (!(magnitude >= BASELINE_MIN_MAGNITUDE)) return;
    n += 1;
  });
  return n;
}
