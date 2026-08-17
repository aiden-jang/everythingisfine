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
 * With no backend the buffer starts when the page loads, so "last 24 hours" is false for the first
 * 24 hours. This returns the later of the requested window and the earliest arrival actually held,
 * and the rail prints whichever it is. DESIGN.md section 10 treats this as a design rule rather
 * than a nicety: it is the difference between a demo and a claim.
 */
export function windowStart(
  now: number, windowMs: number, earliestArrival: number | null,
): { at: number; complete: boolean } {
  const requested = now - windowMs;
  if (earliestArrival === null || earliestArrival <= requested) {
    return { at: requested, complete: true };
  }
  return { at: earliestArrival, complete: false };
}
