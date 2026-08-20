import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import type { Quake, Reading } from "../data/types";

/*
 * When the shaking reached the nearest named place.
 *
 * A marker says an earthquake happened at a point. It does not say that the point is 7km from a town
 * that felt it two seconds later, and that second fact is the one that makes an event something that
 * happened to people rather than a dot in a margin.
 *
 * **The distance is the agency's, not ours.** USGS writes every place as "38 km NW of Stanton, Texas",
 * so the settlement and its distance arrive with the event. The alternative was an authored list of
 * cities with coordinates, which means writing latitudes from memory and then making confident claims
 * about real towns from them: a tenth of a degree of drift is 11km, and 11km is two seconds of a claim
 * that reads as measured. Nothing here is authored, so nothing here can be quietly wrong.
 *
 * **Straight line at crustal speeds, which is why it is capped.** The travel times are path length over
 * a constant velocity, which holds while the path stays in the crust and upper mantle and stops holding
 * at teleseismic distance, where the real wave dives into faster material and arrives earlier than a
 * constant would predict. USGS names the nearest settlement, so these distances are usually tens of
 * kilometres, and anything beyond `MAX_KM` is refused rather than approximated.
 */

/**
 * Beyond this the constant-velocity assumption stops being an approximation and starts being wrong.
 *
 * Mantle velocity climbs with depth, so a 2000km path arrives materially before distance over 6 would
 * say. Nothing near this is common: the distance is to the nearest named place, which is why the cap is
 * a backstop rather than a limit anybody meets.
 */
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
 * The distance and the place out of an agency's own description, or null when it is not that shape.
 *
 * EMSC writes Flynn regions, "OFF EAST COAST OF KAMCHATKA", which name an area and no distance, so
 * they parse to nothing and are correctly skipped. So are USGS's own regional strings like
 * "Flores Sea". Returning null for both is the point: there is no distance to be had, and inventing
 * one from a region's centroid would be exactly the authored-coordinate mistake avoided above.
 */
export function parsePlace(place: string): { km: number; name: string } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*km\s+[NSEW]{1,3}\s+of\s+(.+?)\s*$/i.exec(place);
  if (!m) return null;
  const km = Number(m[1]);
  if (!Number.isFinite(km) || km <= 0) return null;
  return { km, name: m[2]! };
}

/**
 * Path length from the hypocentre to the place, which is not the distance on the map.
 *
 * The published figure is epicentral: measured across the surface. The wave leaves from depth, so the
 * path is the hypotenuse, and at a 45km-deep event 40km away that is 60km rather than 40. Ignoring it
 * would understate the arrival by a third on exactly the deep events where it matters most.
 *
 * A missing depth counts as zero, which follows the decision the event layer already made and
 * documented: the feeds genuinely omit it, and the overwhelming majority of catalogued events are
 * shallow. It biases the arrival early by however deep the event actually was.
 */
export function pathKm(epicentralKm: number, depthKm: number): number {
  const depth = Number.isFinite(depthKm) ? Math.max(0, depthKm) : 0;
  return Math.sqrt(epicentralKm * epicentralKm + depth * depth);
}

/**
 * The arrival, from whichever reading described its own surroundings.
 *
 * The primary first, then the others, because the marker is drawn from the primary and a distance
 * quoted from one agency beside a position from another would be two accounts spliced into one
 * sentence. Depth comes from the same reading as the distance for the same reason.
 */
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
 * Seconds, at the precision the inputs support and no finer.
 *
 * The distance is published to the kilometre and the depth likewise, so a kilometre of rounding is
 * already 0.17 seconds in the answer, and the origin time it is measured from is itself an agency's
 * estimate. Whole seconds are supportable and a decimal is not. Under a second reads as "under a
 * second" rather than as zero, which is a different and wrong claim.
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
