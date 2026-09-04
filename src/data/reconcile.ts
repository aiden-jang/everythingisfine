import { distanceKm } from "../geo/sphere";
import type { Reading, SourceId } from "./types";

/* Deciding whether two agencies are talking about the same earthquake. See ARCHITECTURE.md#srcdatareconcilets. */

/* Both windows are measured, not guessed. Over 24 hours of real M2.5+ activity, 50 of 53 USGS events had an
   EMSC counterpart: See ARCHITECTURE.md#srcdatareconcilets. */
export const TIME_WINDOW_MS = 30_000;
export const DISTANCE_LIMIT_KM = 150;

/* The third axis. In time and distance, genuine pairs and aftershocks overlap. Magnitude is where they do
   not, because two agencies describing one rupture agree about its size: See ARCHITECTURE.md#srcdatareconcilets. */
export const MAGNITUDE_LIMIT = 1.0;

/** True when two readings plausibly describe one earthquake. See ARCHITECTURE.md#srcdatareconcilets. */
export function sameEvent(a: Reading, b: Reading): boolean {
  // Same agency, same identifier is an identity, not a guess: it is a revision of one record.
  if (a.source === b.source) return a.id === b.id;
  if (Math.abs(a.time - b.time) > TIME_WINDOW_MS) return false;
  if (distanceKm(a.lon, a.lat, b.lon, b.lat) > DISTANCE_LIMIT_KM) return false;
  /*
   * A missing magnitude does not split an event. An early reading sometimes arrives without one, and
   * refusing to associate it draws two markers on one rupture until the revision lands: a rare wrong merge
   * traded for a common wrong split, which is the worse of the two.
   */
  if (!Number.isFinite(a.magnitude) || !Number.isFinite(b.magnitude)) return true;
  return Math.abs(a.magnitude - b.magnitude) <= MAGNITUDE_LIMIT;
}

/**
 * Which agency's account the marker is drawn from. USGS first, not because it is more correct but because a
 * marker that changes position depending on which feed arrived first would be worse than one consistently
 * drawn from a single authority. The choice is stable and it is stated on screen.
 */
const PRIORITY: Record<SourceId, number> = { usgs: 0, emsc: 1 };

export function choosePrimary(readings: readonly Reading[]): Reading {
  let best = readings[0];
  if (!best) throw new Error("a quake with no readings is not a quake");
  for (const r of readings) {
    if (PRIORITY[r.source] < PRIORITY[best.source]) best = r;
  }
  return best;
}
