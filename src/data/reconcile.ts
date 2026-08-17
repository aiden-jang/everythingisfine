import { distanceKm } from "../geo/sphere";
import type { Reading, SourceId } from "./types";

/*
 * Deciding whether two agencies are talking about the same earthquake.
 *
 * This is the problem the $0 budget handed the project, and it is a real one. USGS and EMSC both
 * report globally, so most events above about magnitude 4.5 arrive twice: different identifiers,
 * origin times a few seconds apart, epicentres tens of kilometres apart, magnitudes on different
 * scales. Counting them separately would inflate every number on the rail and draw two markers on
 * one rupture.
 *
 * Seismology calls this association, and the honest version of it uses travel-time residuals
 * against station data we do not have. What is available here is time and position, so the rule is
 * a window on both, and the limits of that rule are written down below rather than discovered later.
 */

/*
 * The two windows, set from measurement rather than from intuition.
 *
 * They began at 60 seconds and 200km, which were guesses dressed up as reasoning. Measuring 24
 * hours of real M2.5+ activity, 50 of 53 USGS events had an EMSC counterpart, and the two agencies
 * turn out to agree far more closely than the guess assumed:
 *
 *              median      p95      max
 *   origin time   0.1s     3.0s    16.7s
 *   epicentre     0.0km   19.6km  135.6km
 *
 * The generous window bought nothing and cost something real: at 60s/200km one of those 50 events
 * already had two EMSC candidates to choose between, and every extra second of window is extra
 * exposure to the aftershock false positive below. Tightening to 30s/150km matched exactly the same
 * 50 events while halving the time window, so it is strictly better. Tightening further to
 * 20s/100km would have dropped one genuine pair, which is where the evidence stops supporting it.
 */
export const TIME_WINDOW_MS = 30_000;
export const DISTANCE_LIMIT_KM = 150;

/**
 * True when two readings plausibly describe one earthquake.
 *
 * **Known false positive.** A large event's immediate aftershocks can fall inside both windows, so
 * a genuine aftershock arriving within a minute and 200km of the mainshock will be folded into it.
 * Separating those needs waveform data, which no keyless feed carries. The interface never claims
 * otherwise: the detail panel shows every reading it merged, so a merge that looks wrong is visible
 * rather than hidden behind a single number.
 */
export function sameEvent(a: Reading, b: Reading): boolean {
  // Same agency, same identifier is an identity, not a guess: it is a revision of one record.
  if (a.source === b.source) return a.id === b.id;
  if (Math.abs(a.time - b.time) > TIME_WINDOW_MS) return false;
  return distanceKm(a.lon, a.lat, b.lon, b.lat) <= DISTANCE_LIMIT_KM;
}

/**
 * Which agency's account the marker is drawn from.
 *
 * USGS first. Not because it is more correct, but because it is the global catalogue of record and
 * a marker that changes position depending on which feed happened to arrive first would be worse
 * than one that is consistently drawn from a single authority. The choice is stable and it is
 * stated on screen, which matters more than which way round it goes.
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
