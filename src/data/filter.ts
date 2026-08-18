import type { Filters, Quake } from "./types";

/*
 * What is on screen right now.
 *
 * Pure predicates over a quake and a clock, deliberately taking `now` as an argument rather than
 * reading it. Filtering has to be re-run on every frame while a slider moves, and a function that
 * reads the clock itself cannot be tested for the one case that matters: what happens exactly on a
 * boundary.
 */

/** Magnitude is judged on the primary reading, the same one the marker is drawn from. */
export function passesMagnitude(quake: Quake, min: number): boolean {
  return quake.primary.magnitude >= min;
}

/**
 * Origin time, not arrival.
 *
 * A quake that happened twenty minutes ago but reached us thirty seconds ago belongs twenty minutes
 * back on a timeline, and putting it at the front would be a lie about when the ground moved. This
 * is the reason the store evicts on arrival while the filter selects on origin: the two orderings
 * answer different questions and collapsing them gets one of them wrong.
 */
export function passesWindow(quake: Quake, now: number, windowMs: number): boolean {
  return now - quake.primary.time <= windowMs;
}

/** Shown if any source that reported it is enabled. */
export function passesSource(quake: Quake, enabled: Filters["sources"]): boolean {
  return quake.readings.some((r) => enabled.has(r.source));
}

export function matches(quake: Quake, filters: Filters, now: number): boolean {
  return (
    passesMagnitude(quake, filters.minMagnitude) &&
    passesWindow(quake, now, filters.windowMs) &&
    passesSource(quake, filters.sources)
  );
}

/**
 * The window's honest left edge, as a timestamp.
 *
 * With no backend the app only knows what its sources handed it, so a requested window can reach
 * back further than anything it holds. This returns the later of the requested window and the point
 * coverage actually begins, and the rail prints whichever it is. DESIGN.md section 10 treats this
 * as a design rule rather than a nicety: it is the difference between a demo and a claim.
 *
 * `coveredSince` is coverage, not arrival. It used to be the earliest arrival still held, which was
 * true when the seed fetched an hour and became a permanent lie when it started fetching a day:
 * every event in a full day-long buffer arrives at page open, so the rail said "still filling"
 * forever. A rule that is always on stops being read, which is worse than not having it.
 */
export function windowStart(
  now: number, windowMs: number, coveredSince: number | null,
): { at: number; complete: boolean } {
  const requested = now - windowMs;
  if (coveredSince === null) return { at: now, complete: false };
  if (coveredSince <= requested) return { at: requested, complete: true };
  return { at: coveredSince, complete: false };
}
