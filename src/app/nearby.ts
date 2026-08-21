import { distanceKm } from "../geo/sphere";
import { matches } from "../data/filter";
import type { Store } from "../data/store";
import type { Filters, Quake } from "../data/types";

/*
 * What else happened around here.
 *
 * The most useful thing that can be said about one earthquake is usually about the others near it.
 * A magnitude 3 alone is a magnitude 3; a magnitude 3 with forty neighbours inside a day is an
 * aftershock sequence, and the app already holds every one of them.
 *
 * Computed on selection rather than continuously: it is a full pass over the buffer, and it is
 * answering a question nobody asked until they pinned something.
 */

/** Wide enough to cover an aftershock sequence, narrow enough not to reach the next margin. */
export const NEARBY_KM = 150;

export interface Nearby {
  /** Every other event within range and inside the current filters. */
  count: number;
  /** The largest few, biggest first. Largest rather than closest: it is what a person looks for. */
  notable: { quake: Quake; km: number }[];
  /** Largest magnitude among them, or null when this event stands alone. */
  largest: number | null;
  /**
   * Every neighbour as an offset in milliseconds from the pinned event, negative for earlier.
   *
   * The panel could say how many neighbours there were and how far away, and never when. That is the
   * one thing that decides what a pinned event *is*: an M5 with thirty larger events in the preceding
   * hour is an aftershock, and the same M5 with thirty smaller ones after it is a mainshock. The app
   * held every timestamp needed to tell those apart and showed neither.
   */
  /*
   * `key` so the swarm can be walked, not only read.
   *
   * The strip could draw three hundred neighbours in time order and there was no way to step to one:
   * the offsets carried when each happened and nothing said which event it was. Carrying the key costs
   * one field on a list this function already builds and sorts.
   */
  sequence: { key: string; at: number; magnitude: number }[];
  before: number;
  after: number;
  /** Offset of the largest neighbour, so the panel can say whether the big one already happened. */
  largestAt: number | null;
  /**
   * Which way the local seismicity runs, as a bearing in [0, 180), or null when it does not run.
   *
   * Here so that a cross-section can be offered without asking anybody to guess an orientation.
   * Earthquakes at a subduction zone lie along the trench, so the long axis of the local scatter *is*
   * the trench strike, and the section worth drawing is the one across it. A fixed east-west slice
   * would be right at Japan and useless along the Aleutians.
   *
   * Null when there is no trend to speak of: too few neighbours to fit, or a scatter round enough
   * that its long axis is noise. Both are honest answers and neither is a reason to refuse a section.
   */
  trendDeg: number | null;
}

/** Below this many neighbours a long axis is fitted to noise. */
const TREND_MIN_POINTS = 5;
/**
 * How elongated a scatter has to be before its long axis means anything.
 *
 * A trench is strongly elongated, commonly three to one or more. A round cluster is one to one, and
 * its principal axis is whichever way the noise fell, which would send the section off at an angle
 * that looks deliberate and is not. 1.5 is comfortably above round and well below any real margin.
 */
const TREND_MIN_RATIO = 1.5;

/**
 * The long axis of a scatter, from the sums of its second moments.
 *
 * Split out from the walk that accumulates them so it can be read and tested as the arithmetic it is.
 * Degrees are scaled by `cos(lat)` on the way in, so east and north are comparable distances and the
 * axis is not pulled toward east at high latitude.
 *
 * Returned as a bearing rather than a maths angle, and modulo 180 rather than 360, because a line has
 * an orientation and no direction: a trench running north-east runs south-west just as truly.
 */
export function trendFrom(
  n: number, sx: number, sy: number, sxx: number, syy: number, sxy: number,
): number | null {
  if (n < TREND_MIN_POINTS) return null;
  // About the centroid, not about the pinned event: the event sits somewhere on the trend, and
  // measuring spread from a point off the centre inflates whichever axis it is offset along.
  const cxx = sxx / n - (sx / n) ** 2;
  const cyy = syy / n - (sy / n) ** 2;
  const cxy = sxy / n - (sx / n) * (sy / n);

  const mean = (cxx + cyy) / 2;
  const diff = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy ** 2);
  const major = mean + diff;
  const minor = mean - diff;
  if (major <= 0) return null;
  /*
   * The minor axis floored at zero rather than trusted.
   *
   * A perfectly straight line of events has a minor axis of exactly zero, and the subtraction that
   * produces it can land a rounding step below, so a `< 0` rejection would throw out the single
   * clearest trend this can be handed. Zero then means maximally elongated, which is what it is, and
   * the ratio test is skipped rather than dividing by it.
   */
  const spread = Math.max(0, minor);
  if (spread > 0 && major / spread < TREND_MIN_RATIO) return null;

  // Maths angle of the long axis, counterclockwise from east, then turned into a compass bearing.
  const phi = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const bearing = 90 - (phi * 180) / Math.PI;
  return ((bearing % 180) + 180) % 180;
}

export function findNearby(
  store: Store, quake: Quake, filters: Filters, now: number,
): Nearby {
  const found: { quake: Quake; km: number }[] = [];
  const { lon, lat } = quake.primary;
  /*
   * Second moments accumulated inside the walk that is already happening.
   *
   * A separate pass to fit the trend would be a second sweep of the buffer for one angle, and this
   * function's own note records the 56ms the panel used to pay for exactly that kind of extra work.
   */
  const scale = Math.cos((lat * Math.PI) / 180);
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;

  store.forEach((other) => {
    if (other.key === quake.key) return;
    if (!matches(other, filters, now)) return;
    const km = distanceKm(lon, lat, other.primary.lon, other.primary.lat);
    if (km > NEARBY_KM) return;
    found.push({ quake: other, km });
    // Wrapped, so a neighbourhood straddling the date line is not measured as 360 degrees wide.
    let dLon = other.primary.lon - lon;
    dLon -= Math.round(dLon / 360) * 360;
    const x = dLon * scale;
    const y = other.primary.lat - lat;
    n += 1;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  });

  /*
   * The four largest by selection, not by sorting all of them.
   *
   * Sorting the whole set to take four is O(n log n) for a fixed-size answer, and in a swarm `found`
   * is the whole buffer. Measured at fifty thousand neighbours the full version cost 56ms, which the
   * panel paid every second because it re-renders with the clock.
   */
  const notable: { quake: Quake; km: number }[] = [];
  for (const candidate of found) {
    const mag = candidate.quake.primary.magnitude;
    if (notable.length === 4 && mag <= notable[3]!.quake.primary.magnitude) continue;
    const at = notable.findIndex((n) => mag > n.quake.primary.magnitude);
    notable.splice(at === -1 ? notable.length : at, 0, candidate);
    if (notable.length > 4) notable.pop();
  }
  const biggest = notable[0];

  const origin = quake.primary.time;
  // Already in arrival order from the store's walk, which is not origin order, so this sort stays.
  const sequence = found
    .map(({ quake: other }) => ({
      key: other.key,
      at: other.primary.time - origin,
      magnitude: other.primary.magnitude,
    }))
    .sort((a, b) => a.at - b.at);

  return {
    count: found.length,
    notable,
    largest: biggest ? biggest.quake.primary.magnitude : null,
    sequence,
    before: sequence.filter((e) => e.at < 0).length,
    after: sequence.length - sequence.filter((e) => e.at < 0).length,
    largestAt: biggest ? biggest.quake.primary.time - origin : null,
    trendDeg: trendFrom(n, sx, sy, sxx, syy, sxy),
  };
}

/**
 * Depth class, in the terms seismologists use.
 *
 * Not decoration: it changes what an earthquake is. Shallow events do the damage, intermediate and
 * deep ones happen inside a descending slab and are usually felt far more weakly for their size.
 * The boundaries are the conventional ones at 70km and 300km.
 */
export function depthClass(depthKm: number): string | null {
  if (!Number.isFinite(depthKm)) return null;
  if (depthKm < 70) return "shallow";
  if (depthKm < 300) return "intermediate";
  return "deep";
}

/**
 * The neighbours immediately either side of the pinned event in time.
 *
 * The two steps a person actually wants in a swarm: what happened just before this, and what happened
 * just after. Nearest-in-time rather than nearest-in-space, because a sequence is a thing that unfolds -
 * "the next one" means the next one to happen.
 *
 * Ties at the same instant resolve to whichever the sort put first, which is arbitrary and harmless: two
 * events sharing an origin time are two events, and stepping visits both.
 */
export function stepsFrom(
  sequence: readonly { key: string; at: number; magnitude: number }[],
): { earlier: { key: string; magnitude: number } | null; later: { key: string; magnitude: number } | null } {
  let earlier: { key: string; magnitude: number } | null = null;
  let later: { key: string; magnitude: number } | null = null;
  let earlierAt = -Infinity;
  let laterAt = Infinity;
  for (const entry of sequence) {
    // Strictly one side or the other. An offset of zero is a neighbour sharing this event's instant,
    // and calling it "earlier" or "later" would be inventing an order the data does not have.
    if (entry.at < 0 && entry.at > earlierAt) {
      earlierAt = entry.at;
      earlier = { key: entry.key, magnitude: entry.magnitude };
    }
    if (entry.at > 0 && entry.at < laterAt) {
      laterAt = entry.at;
      later = { key: entry.key, magnitude: entry.magnitude };
    }
  }
  return { earlier, later };
}
