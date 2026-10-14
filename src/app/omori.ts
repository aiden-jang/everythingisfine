/* Omori's law, drawn against what happened. Aftershocks slow down as one over elapsed time, so the running
   count is a logarithm: steep, then almost flat. A swarm climbs in a straight line instead. See ARCHITECTURE.md#srcappomorits. */

/**
 * Omori's `c`, the offset that keeps the rate finite at the origin. Real catalogues put it between seconds
 * and a few hours, and it matters most in the first minutes - which is where a global feed is least
 * complete. Six minutes is inside the usual range and is stated rather than fitted.
 */
export const OMORI_C_MS = 6 * 60_000;

/** The textbook exponent. Real sequences sit between about 0.9 and 1.4; held at 1 because that is the value
 * the law is quoted at and it makes the cumulative form a plain logarithm. */
export const OMORI_P = 1;

/** Below this many events after the mainshock there is no shape to compare anything to. */
export const MIN_AFTER = 8;

export interface Point {
  /** Milliseconds after the pinned event. */
  at: number;
  /** Events counted up to and including this moment. */
  n: number;
}

/** The observed count over time, as a staircase. Only what followed: counting neighbours from before the
 * pinned event would put a rising line to the left of an event that had not happened yet. */
export function observed(sequence: readonly { at: number }[]): Point[] {
  const after = sequence
    .filter((e) => e.at > 0)
    .map((e) => e.at)
    .sort((a, b) => a - b);
  return after.map((at, i) => ({ at, n: i + 1 }));
}

/**
 * The law itself, sampled, and scaled to finish on the observed total. Normalising is what makes this a
 * comparison of shape rather than of amount: the question is whether the arrivals bunch at the start, which
 * is answered by where the curve sits in between and not by where it ends.
 */
export function reference(spanMs: number, total: number, steps = 32): Point[] {
  if (spanMs <= 0 || total <= 0 || steps < 1) return [];
  const c = OMORI_C_MS;
  // The p = 1 cumulative form. For p != 1 it is a power law, and that branch is not written because
  // `OMORI_P` is not a parameter.
  const shape = (t: number): number => Math.log((t + c) / c);
  const end = shape(spanMs);
  if (end <= 0) return [];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const at = (spanMs * i) / steps;
    return { at, n: (shape(at) / end) * total };
  });
}

/**
 * How much of the total the law expects by a fraction of the way through. Split out because it is the number
 * that decided this was worth drawing: over twelve hours the law is 86% done at the halfway point against
 * 50% for a straight line, which in a 28 pixel plot is ten pixels of daylight.
 */
export function expectedFraction(spanMs: number, atMs: number): number {
  if (spanMs <= 0) return 0;
  const c = OMORI_C_MS;
  const end = Math.log((spanMs + c) / c);
  if (end <= 0) return 0;
  return Math.log((Math.max(0, atMs) + c) / c) / end;
}

/**
 * The observed counts as a step line. Two points per arrival, across then up, because the count is
 * unchanged between events: a sloping line would claim arrivals at times nothing happened. See
 * ARCHITECTURE.md.
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
