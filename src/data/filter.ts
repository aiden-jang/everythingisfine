import type { Filters, Quake } from "./types";

/*
 * What is on screen right now. Pure predicates over a quake and a clock, taking `now` as an argument rather
 * than reading it: filtering re-runs on every frame while a slider moves, and a function that reads the clock
 * cannot be tested for the one case that matters, which is what happens exactly on a boundary.
 */

/** Magnitude is judged on the primary reading, the same one the marker is drawn from. */
export function passesMagnitude(quake: Quake, min: number): boolean {
  return quake.primary.magnitude >= min;
}

/**
 * Origin time, not arrival. A quake that happened twenty minutes ago but reached us thirty seconds ago belongs
 * twenty minutes back on a timeline. This is why the store evicts on arrival while the filter selects on
 * origin: the two orderings answer different questions.
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

/** The window's honest left edge, as a timestamp. See ARCHITECTURE.md. */
export function windowStart(
  now: number, windowMs: number, coveredSince: number | null,
): { at: number; complete: boolean } {
  const requested = now - windowMs;
  if (coveredSince === null) return { at: now, complete: false };
  if (coveredSince <= requested) return { at: requested, complete: true };
  return { at: coveredSince, complete: false };
}
