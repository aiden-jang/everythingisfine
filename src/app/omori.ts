/*
 * Omori's law, drawn against what actually happened.
 *
 * Aftershock rate decays as one over elapsed time, and the cumulative count that follows from it is a
 * logarithm: steep at first, then almost flat. The sequence strip already holds every neighbour as a
 * tick in time, so the app was one curve away from showing whether a real sequence does that, and a
 * sequence that does not is the more interesting outcome. A swarm climbs in a straight line.
 *
 * **A reference curve, not a fit, and that is the whole design.** Fitting `p` to a dozen aftershocks
 * produces a number governed by noise, and printing it would be analysis in the sense of looking like
 * analysis. `Sequence.tsx` already refuses to call an event an aftershock, on the grounds that the
 * judgement depends on things no keyless feed carries; a fitted exponent would be the same overreach
 * with a decimal point on it. So the law is drawn at its textbook exponent, scaled to end on the
 * observed total, and whether reality follows it is left where that file already leaves it.
 *
 * **Cumulative rather than a rate.** A rate needs bins, bin width is a free parameter nobody chose,
 * and at these counts the choice decides the answer. A cumulative curve has no bins: it is exactly the
 * data, and the comparison is a shape against a shape.
 */

/**
 * Omori's `c`, the offset that keeps the rate finite at the origin.
 *
 * Real catalogues put it between seconds and a few hours, and it matters most in the first minutes,
 * which is also where a global feed is least complete: the small aftershocks of the first quarter hour
 * are the ones that go unreported while the network is still resolving the mainshock. Six minutes is
 * inside the usual range and is stated here rather than fitted, so the curve has exactly one number
 * behind it and that number is visible.
 */
export const OMORI_C_MS = 6 * 60_000;

/**
 * The textbook exponent. Real sequences sit between about 0.9 and 1.4.
 *
 * Held at 1 because that is the value the law is quoted at and because it makes the cumulative form a
 * plain logarithm. Anything else here would be a fit wearing a constant's clothes.
 */
export const OMORI_P = 1;

/** Below this many events after the mainshock there is no shape to compare anything to. */
export const MIN_AFTER = 8;

export interface Point {
  /** Milliseconds after the pinned event. */
  at: number;
  /** Events counted up to and including this moment. */
  n: number;
}

/**
 * The observed count over time, as a staircase.
 *
 * Only what followed. Neighbours before the pinned event are on the strip and are not part of its
 * decay, and counting them would put a rising line to the left of an event that had not happened yet.
 */
export function observed(sequence: readonly { at: number }[]): Point[] {
  const after = sequence.filter((e) => e.at > 0).map((e) => e.at).sort((a, b) => a - b);
  return after.map((at, i) => ({ at, n: i + 1 }));
}

/**
 * The law itself, sampled, and scaled to finish on the observed total.
 *
 * Normalising to the total is what makes this a comparison of shape rather than of amount. `K` is a
 * property of the mainshock's productivity, which is not what is in question here: the question is
 * whether the arrivals bunch at the start the way the law says, and that is answered by where the
 * curve sits in between, not by where it ends.
 */
export function reference(spanMs: number, total: number, steps = 32): Point[] {
  if (spanMs <= 0 || total <= 0 || steps < 1) return [];
  const c = OMORI_C_MS;
  // The p = 1 cumulative form. For p != 1 it is a power law, and the branch is not written because
  // `OMORI_P` is not a parameter: see its own note.
  const shape = (t: number): number => Math.log((t + c) / c);
  const end = shape(spanMs);
  if (end <= 0) return [];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const at = (spanMs * i) / steps;
    return { at, n: (shape(at) / end) * total };
  });
}

/**
 * How much of the total the law expects by a fraction of the way through.
 *
 * Split out because it is the number that decided this was worth drawing at all: over a twelve hour
 * span with `c` at six minutes, the law is 86% done at the halfway point against 50% for a straight
 * line. In a 28 pixel plot that is ten pixels of daylight, so the two shapes are distinguishable
 * before anybody squints.
 */
export function expectedFraction(spanMs: number, atMs: number): number {
  if (spanMs <= 0) return 0;
  const c = OMORI_C_MS;
  const end = Math.log((spanMs + c) / c);
  if (end <= 0) return 0;
  return Math.log((Math.max(0, atMs) + c) / c) / end;
}

/**
 * The observed counts as a step line, ready to be mapped to coordinates.
 *
 * Two points per arrival, across then up, because the count is unchanged between events: a line
 * sloping through the gap would claim arrivals at times nothing happened, which is the one thing a
 * cumulative plot is supposed to make impossible to say.
 *
 * Starts at the origin, so the line begins at the mainshock rather than at the first aftershock.
 * Without it the plot opens partway across with no explanation of where the count came from.
 *
 * Here rather than in the component because the doubling is the part that can be wrong, and a
 * component cannot be asked about it without a DOM.
 */
export function staircase(after: readonly Point[]): Point[] {
  if (after.length === 0) return [];
  const out: Point[] = [{ at: 0, n: 0 }];
  for (const p of after) {
    out.push({ at: p.at, n: p.n - 1 });
    out.push({ at: p.at, n: p.n });
  }
  return out;
}
