import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import type { Quake, Reading } from "../data/types";
import { distanceKm } from "../geo/sphere";

/* When the shaking reached the nearest named place. See ARCHITECTURE.md. */

/** Beyond this the constant-velocity assumption stops being an approximation and starts being wrong: a
 * 2000km path arrives materially before distance over 6 would say. A backstop, not a limit anybody meets. */
export const MAX_KM = 700;

export interface Arrival {
  /** The settlement the agency named. */
  place: string;
  /** Epicentral distance, as published. */
  km: number;
  /** Seconds from the rupture to the first shake. */
  p: number;
  /** Seconds from the P arrival to the S arrival, which is the gap that measures distance. */
  gap: number;
}

/**
 * The distance and the place out of an agency's own description, or null when it is not that shape. EMSC
 * writes Flynn regions - "OFF EAST COAST OF KAMCHATKA" - which name an area and no distance, so they parse
 * to nothing. Inventing one from a region's centroid would be the authored-coordinate mistake above.
 */
export function parsePlace(place: string): { km: number; name: string } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*km\s+[NSEW]{1,3}\s+of\s+(.+?)\s*$/i.exec(place);
  if (!m) return null;
  const km = Number(m[1]);
  if (!Number.isFinite(km) || km <= 0) return null;
  return { km, name: m[2]! };
}

/** Path length from the hypocentre to the place, which is not the distance on the map. See ARCHITECTURE.md. */
export function pathKm(epicentralKm: number, depthKm: number): number {
  const depth = Number.isFinite(depthKm) ? Math.max(0, depthKm) : 0;
  return Math.sqrt(epicentralKm * epicentralKm + depth * depth);
}

/** The arrival, from whichever reading described its own surroundings. The primary first, because a
 * distance quoted from one agency beside a position from another would be two accounts spliced into one
 * sentence. Depth comes from the same reading as the distance. */
export function arrivalFor(quake: Quake): Arrival | null {
  const order: Reading[] = [
    quake.primary,
    ...quake.readings.filter((r) => r.source !== quake.primary.source),
  ];
  for (const reading of order) {
    const named = parsePlace(reading.place);
    if (!named || named.km > MAX_KM) continue;
    const path = pathKm(named.km, reading.depthKm);
    const p = path / P_WAVE_KM_PER_S;
    const s = path / S_WAVE_KM_PER_S;
    return { place: named.name, km: named.km, p, gap: s - p };
  }
  return null;
}

/**
 * Seconds, at the precision the inputs support and no finer. The distance is published to the kilometre,
 * which is already 0.17 seconds, and the origin time is itself an estimate. Under a second reads as "under
 * a second" rather than as zero, which is a different and wrong claim.
 */
export function seconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "unknown";
  if (value < 1) return "under a second";
  if (value < 120) {
    const whole = Math.round(value);
    return `${whole} second${whole === 1 ? "" : "s"}`;
  }
  const minutes = Math.round(value / 60);
  return `${minutes} minutes`;
}

export interface Separation {
  km: number;
  /** Seconds for a P wave to cross it, or null past the distance a constant velocity can describe. */
  p: number | null;
}

/**
 * Distance between two events, and how long the first one's P wave took to reach the second. See
 * ARCHITECTURE.md.
 */
export function between(aLon: number, aLat: number, bLon: number, bLat: number): Separation {
  const km = distanceKm(aLon, aLat, bLon, bLat);
  return { km, p: km <= MAX_KM ? km / P_WAVE_KM_PER_S : null };
}
