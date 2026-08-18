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
  sequence: { at: number; magnitude: number }[];
  before: number;
  after: number;
  /** Offset of the largest neighbour, so the panel can say whether the big one already happened. */
  largestAt: number | null;
}

export function findNearby(
  store: Store, quake: Quake, filters: Filters, now: number,
): Nearby {
  const found: { quake: Quake; km: number }[] = [];
  const { lon, lat } = quake.primary;

  store.forEach((other) => {
    if (other.key === quake.key) return;
    if (!matches(other, filters, now)) return;
    const km = distanceKm(lon, lat, other.primary.lon, other.primary.lat);
    if (km <= NEARBY_KM) found.push({ quake: other, km });
  });

  const byMagnitude = [...found]
    .sort((a, b) => b.quake.primary.magnitude - a.quake.primary.magnitude);
  const notable = byMagnitude.slice(0, 4);
  const biggest = byMagnitude[0];

  const origin = quake.primary.time;
  const sequence = found
    .map(({ quake: other }) => ({
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
