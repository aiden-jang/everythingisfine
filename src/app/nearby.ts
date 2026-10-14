import { distanceKm } from "../geo/sphere";
import { matches } from "../data/filter";
import type { Store } from "../data/store";
import type { Filters, Quake } from "../data/types";

/* What else happened around here. See ARCHITECTURE.md#srcappnearbyts. */

/** Wide enough to cover an aftershock sequence, narrow enough not to reach the next margin. */
export const NEARBY_KM = 150;

export interface Nearby {
  /** Every other event within range and inside the current filters. */
  count: number;
  /** The largest few, biggest first. Largest rather than closest: it is what a person looks for. */
  notable: { quake: Quake; km: number }[];
  /** Largest magnitude among them, or null when this event stands alone. */
  largest: number | null;
  /** Every neighbour as an offset in ms from the pinned event, negative for earlier. This is what decides
   * what a pinned event is: an M5 with thirty larger events in the preceding hour is an aftershock, and the
   * same M5 with thirty smaller ones after it is a mainshock. */
  // `key` so the swarm can be walked, not only read. The offsets say when each neighbour happened and
  // nothing said which event it was.
  sequence: { key: string; at: number; magnitude: number }[];
  before: number;
  after: number;
  /** Offset of the largest neighbour, so the panel can say whether the big one already happened. */
  largestAt: number | null;
  /**
   * Which way the local seismicity runs, as a bearing in [0, 180), or null when it does not run. See
   * ARCHITECTURE.md.
   */
  trendDeg: number | null;
}

/** Below this many neighbours a long axis is fitted to noise. */
const TREND_MIN_POINTS = 5;
/**
 * How elongated a scatter has to be before its long axis means anything. A trench is commonly three to one
 * or more; a round cluster is one to one and its principal axis is whichever way the noise fell, which
 * sends the section off at an angle that looks deliberate and is not.
 */
const TREND_MIN_RATIO = 1.5;

/** The long axis of a scatter, from the sums of its second moments. See ARCHITECTURE.md#srcappnearbyts. */
export function trendFrom(
  n: number,
  sx: number,
  sy: number,
  sxx: number,
  syy: number,
  sxy: number,
): number | null {
  if (n < TREND_MIN_POINTS) return null;
  // About the centroid, not about the pinned event: the event sits somewhere on the trend, and measuring
  // spread from a point off the centre inflates whichever axis it is offset along.
  const cxx = sxx / n - (sx / n) ** 2;
  const cyy = syy / n - (sy / n) ** 2;
  const cxy = sxy / n - (sx / n) * (sy / n);

  const mean = (cxx + cyy) / 2;
  const diff = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy ** 2);
  const major = mean + diff;
  const minor = mean - diff;
  if (major <= 0) return null;
  /*
   * The minor axis floored at zero rather than trusted. A perfectly straight line of events has a minor
   * axis of exactly zero and the subtraction can land a rounding step below, so a `< 0` rejection would
   * throw out the clearest trend this can be handed.
   */
  const spread = Math.max(0, minor);
  if (spread > 0 && major / spread < TREND_MIN_RATIO) return null;

  // Maths angle of the long axis, counterclockwise from east, then turned into a compass bearing.
  const phi = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const bearing = 90 - (phi * 180) / Math.PI;
  return ((bearing % 180) + 180) % 180;
}

export function findNearby(store: Store, quake: Quake, filters: Filters, now: number): Nearby {
  const notable: { quake: Quake; km: number }[] = [];
  const sequence: Nearby["sequence"] = [];
  const origin = quake.primary.time;
  let before = 0;
  const { lon, lat } = quake.primary;
  // Second moments accumulated inside the walk that is already happening. A separate pass would be a second
  // sweep of the buffer for one angle.
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
    const at = other.primary.time - origin;
    sequence.push({ key: other.key, at, magnitude: other.primary.magnitude });
    if (at < 0) before += 1;
    // Keep only the four display candidates; a dense swarm needs no second object per neighbour.
    const mag = other.primary.magnitude;
    if (notable.length < 4 || mag > notable[3]!.quake.primary.magnitude) {
      const index = notable.findIndex((entry) => mag > entry.quake.primary.magnitude);
      notable.splice(index === -1 ? notable.length : index, 0, { quake: other, km });
      if (notable.length > 4) notable.pop();
    }
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

  const biggest = notable[0];
  // Arrival order is not origin order; the timeline needs every neighbour in origin order.
  sequence.sort((a, b) => a.at - b.at);

  return {
    count: n,
    notable,
    largest: biggest ? biggest.quake.primary.magnitude : null,
    sequence,
    before,
    after: n - before,
    largestAt: biggest ? biggest.quake.primary.time - origin : null,
    trendDeg: trendFrom(n, sx, sy, sxx, syy, sxy),
  };
}

/**
 * Depth class, in the terms seismologists use. Not decoration: shallow events do the damage, and deep ones
 * happen inside a descending slab and are felt far more weakly for their size.
 */
export function depthClass(depthKm: number): string | null {
  if (!Number.isFinite(depthKm)) return null;
  if (depthKm < 70) return "shallow";
  if (depthKm < 300) return "intermediate";
  return "deep";
}

/**
 * The neighbours immediately either side of the pinned event in time. Nearest-in-time rather than
 * nearest-in-space, because a sequence unfolds: "the next one" means the next one to happen. See
 * ARCHITECTURE.md.
 */
export function stepsFrom(sequence: readonly { key: string; at: number; magnitude: number }[]): {
  earlier: { key: string; magnitude: number } | null;
  later: { key: string; magnitude: number } | null;
} {
  let earlier: { key: string; magnitude: number } | null = null;
  let later: { key: string; magnitude: number } | null = null;
  let earlierAt = -Infinity;
  let laterAt = Infinity;
  for (const entry of sequence) {
    // Strictly one side or the other. An offset of zero is a neighbour sharing this event's instant, and
    // calling it "earlier" or "later" would invent an order the data does not have.
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
