import { energyOf } from "./histogram";
import { NOTABLE_DAYS, type NotableDay } from "./notableDays";

/*
 * Today against the largest earthquake ever recorded.
 *
 * The rail already says how much of the window's energy the biggest event accounts for, and that number
 * teaches the logarithm inside one window. What it cannot do is say whether the window itself is large,
 * because it has nothing outside itself to be measured against. The ranking line answers that by count.
 * This answers it by energy, which is the axis where the answer is startling.
 *
 * **No new data, and that is why this shape was chosen.** Valdivia's magnitude is already in
 * `NOTABLE_DAYS`, `energyOf` is already in `histogram.ts`, and the window's total is already accumulated
 * there to produce the share. The comparison is a division between two numbers the app was holding.
 *
 * **The reference is one event, and the sentence says so.** Comparing a whole day of Valdivia against a
 * whole window here would need every event from 1960, which the feeds do not reach and which nobody has
 * in a form this app could ask for. One event against a window is asymmetric, so the wording carries the
 * asymmetry rather than hiding it: it is that *earthquake* against everything in this window. That also
 * makes it a conservative claim - the real day was larger than its mainshock.
 *
 * **Ratios only, because `energyOf` is not joules.** Its own comment refuses that reading, so a figure
 * quoted in any unit would be inventing precision. A ratio between two of its outputs is exactly what it
 * supports.
 */

/** The largest instrumentally recorded earthquake, and the reason the list is sorted the way it is. */
export const REFERENCE: NotableDay = NOTABLE_DAYS[0]!;

export interface Versus {
  /** How many times the reference event's energy exceeds the window's total. */
  times: number;
  /** The day and place, for the sentence. */
  day: NotableDay;
  /** True when the window has out-grown the reference, which is the case worth wording differently. */
  exceeded: boolean;
}

/**
 * The comparison, or null when there is nothing to compare.
 *
 * Null on an empty window rather than infinity: dividing by no energy at all is not a large ratio, it is
 * an absent one, and "infinitely more than today" is the kind of sentence this app exists not to print.
 */
export function versusReference(energyTotal: number, day: NotableDay = REFERENCE): Versus | null {
  if (!Number.isFinite(energyTotal) || energyTotal <= 0) return null;
  const reference = energyOf(day.magnitude);
  if (!Number.isFinite(reference) || reference <= 0) return null;
  const ratio = reference / energyTotal;
  if (!Number.isFinite(ratio)) return null;
  return ratio >= 1
    ? { times: ratio, day, exceeded: false }
    : { times: energyTotal / reference, day, exceeded: true };
}

/**
 * A multiplier rounded to the precision the input deserves, which is not much.
 *
 * Magnitudes arrive at one decimal, and a tenth of a magnitude is already 41% of the energy, so the
 * third significant figure of any ratio built from them is noise wearing a digit. Two significant
 * figures, then whole thousands above ten thousand, because "42,000 times" and "41,687 times" make the
 * same point and only one of them is honest about where it came from.
 */
export function timesLabel(times: number): string {
  if (!Number.isFinite(times) || times <= 0) return "unknown";
  if (times < 10) return times.toFixed(1);
  if (times < 1_000) return String(Math.round(times / 10) * 10);
  if (times < 1_000_000) return (Math.round(times / 1_000) * 1_000).toLocaleString("en");
  // Past a million the digits stop being read and start being counted, so the word does the work.
  return `${(times / 1_000_000).toFixed(times < 10_000_000 ? 1 : 0)} million`;
}
