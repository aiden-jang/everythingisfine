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

/*
 * The third axis, and the one that was missing.
 *
 * The note above concluded that no threshold separates a genuine cross-agency pair from a mainshock and
 * its aftershock. That was true of the two axes it measured: in time and distance the populations really
 * do overlap. Magnitude is a different axis, and two agencies describing **one** rupture agree about its
 * size to a degree the aftershock case cannot imitate.
 *
 * Measured the same way the windows above were, on two independent samples:
 *
 *                            pairs   median   p90    max
 *   M2.5+, 24 hours            50     0.00    0.20   0.40
 *   M6+, 120 days              47     0.00    0.00   0.10
 *
 * The worst disagreement anywhere in 97 genuine pairs is **0.40**, and it is on small events, where the
 * scales differ most. The obvious objection - that `mb` saturates while `Mww` does not, so a great
 * earthquake would be split into two markers, which would be far worse than the bug being fixed - does
 * not survive the second sample: at M6 and above both agencies report Mw or Mww and the pairs agree to
 * 0.1, M7.8 and M7.7 included.
 *
 * So one magnitude unit costs nothing on the true population, with two and a half times the headroom
 * over the worst pair observed, and sits below the ~1.2 units that Bath's law puts between a mainshock
 * and its *largest* aftershock - most aftershocks being much further down than that.
 *
 * **It is a partial guard and not a fix.** An aftershock within one magnitude unit of its mainshock, a
 * doublet, still merges. What it removes is the common case, and it does so without narrowing the
 * windows that were already measured to be right.
 */
export const MAGNITUDE_LIMIT = 1.0;

/**
 * True when two readings plausibly describe one earthquake.
 *
 * **Known false positive, now narrowed.** A large event's immediate aftershocks can fall inside the time
 * and distance windows, so an aftershock arriving seconds later and nearby was folded into the mainshock.
 * The magnitude window above removes the common case: an aftershock more than one unit below its
 * mainshock is no longer a candidate. A doublet within one unit still merges, and separating *that* needs
 * waveform data no keyless feed carries. The interface never claims otherwise: the detail panel shows
 * every reading it merged, so a merge that looks wrong is visible rather than hidden behind one number.
 */
export function sameEvent(a: Reading, b: Reading): boolean {
  // Same agency, same identifier is an identity, not a guess: it is a revision of one record.
  if (a.source === b.source) return a.id === b.id;
  if (Math.abs(a.time - b.time) > TIME_WINDOW_MS) return false;
  if (distanceKm(a.lon, a.lat, b.lon, b.lat) > DISTANCE_LIMIT_KM) return false;
  /*
   * A missing magnitude does not split an event.
   *
   * An early reading sometimes arrives without one, and refusing to associate it would draw two markers
   * on one rupture until the revision landed - trading a rare wrong merge for a common wrong split, which
   * is the worse of the two on a globe where a marker means an earthquake.
   */
  if (!Number.isFinite(a.magnitude) || !Number.isFinite(b.magnitude)) return true;
  return Math.abs(a.magnitude - b.magnitude) <= MAGNITUDE_LIMIT;
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
