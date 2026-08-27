import { distanceKm } from "../geo/sphere";
import type { Reading, SourceId } from "./types";

/*
 * Deciding whether two agencies are talking about the same earthquake.
 *
 * Most events above about magnitude 4.5 arrive twice: different identifiers, origin times a few seconds
 * apart, epicentres tens of kilometres apart, magnitudes on different scales. Counting them separately
 * inflates every number on the rail and draws two markers on one rupture.
 *
 * The honest version of association uses travel-time residuals against station data we do not have. What is
 * available is time, position and size, so the rule is a window on each.
 */

/*
 * The two windows, set from measurement rather than intuition. Over 24 hours of real M2.5+ activity, 50 of
 * 53 USGS events had an EMSC counterpart:
 *
 *              median      p95      max
 *   origin time   0.1s     3.0s    16.7s
 *   epicentre     0.0km   19.6km  135.6km
 *
 * 30s/150km matches the same 50 events as the original 60s/200km guess while halving the exposure to the
 * aftershock false positive below. 20s/100km would drop one genuine pair, which is where the evidence stops.
 */
export const TIME_WINDOW_MS = 30_000;
export const DISTANCE_LIMIT_KM = 150;

/*
 * The third axis. In time and distance the genuine-pair and aftershock populations really do overlap;
 * magnitude is where they do not, because two agencies describing one rupture agree about its size.
 *
 *                            pairs   median   p90    max
 *   M2.5+, 24 hours            50     0.00    0.20   0.40
 *   M6+, 120 days              47     0.00    0.00   0.10
 *
 * The obvious objection - `mb` saturates while `Mww` does not, so a great earthquake would split into two
 * markers - does not survive the second sample: at M6 and above both agencies report Mw or Mww.
 *
 * One magnitude unit has two and a half times the headroom over the worst pair observed and sits below the
 * ~1.2 units Bath's law puts between a mainshock and its largest aftershock.
 *
 * A partial guard, not a fix: a doublet within one unit still merges.
 */
export const MAGNITUDE_LIMIT = 1.0;

/**
 * True when two readings plausibly describe one earthquake.
 *
 * Known false positive, narrowed. A large event's immediate aftershocks fall inside the time and distance
 * windows; the magnitude window removes the common case. A doublet within one unit still merges, and
 * separating that needs waveform data no keyless feed carries. The detail panel shows every reading it
 * merged, so a wrong merge is visible rather than hidden behind one number.
 */
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
