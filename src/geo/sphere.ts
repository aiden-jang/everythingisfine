/*
 * Turning degrees into points on a ball.
 *
 * Longitude increases east and the prime meridian faces +Z, so a camera parked on +Z looking at the
 * origin sees 0 degrees dead centre with east to the right. Everything downstream depends on that
 * convention, which is why it lives in one place rather than being re-derived per module.
 */

export const DEG = Math.PI / 180;

/** Degrees to a point on a sphere of radius `r`. */
export function toVec3(lon: number, lat: number, r: number): [number, number, number] {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const c = Math.cos(phi) * r;
  return [c * Math.sin(lam), Math.sin(phi) * r, c * Math.cos(lam)];
}

/** Mean Earth radius. The value the two agencies' own distance figures are quoted against. */
export const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the shorter law-of-cosines form, which loses precision to floating point
 * at small separations. Small separations are the entire use here: deciding whether two agencies
 * are describing the same rupture turns on tens of kilometres, and that is exactly where the cheap
 * formula degrades.
 */
export function distanceKm(
  aLon: number, aLat: number, bLon: number, bLat: number,
): number {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle-ish edge length in degrees. Cheap and only ever used as a subdivision threshold. */
export function spanDeg(aLon: number, aLat: number, bLon: number, bLat: number): number {
  let d = bLon - aLon;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  // Longitude degrees shrink toward the poles. Without the cosine, polar rings look enormously
  // over-subdivided and equatorial ones under-subdivided.
  const scale = Math.cos(((aLat + bLat) / 2) * DEG);
  const dx = d * scale;
  const dy = bLat - aLat;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Meridians and parallels at a fixed interval, as line segment pairs ready for a BufferGeometry.
 *
 * Present enough to give the sphere something to read against while it turns, quiet enough to
 * vanish once events are on it. Poles are skipped: a parallel at 90 degrees is a point.
 */
export function graticule(
  stepDeg: number, radius: number,
): { position: Float32Array; lonLat: Float32Array } {
  const out: number[] = [];
  const ll: number[] = [];
  const push = (lon: number, lat: number): void => {
    out.push(...toVec3(lon, lat, radius));
    ll.push(lon, lat);
  };

  for (let lat = -90 + stepDeg; lat <= 90 - stepDeg; lat += stepDeg) {
    for (let lon = -180; lon < 180; lon += 3) {
      push(lon, lat);
      push(lon + 3, lat);
    }
  }
  /*
   * Full length again. This stopped three degrees short of each pole for a while, because the map
   * recovered longitude from the position and `atan2(0, 0)` at a pole returns zero, collapsing every
   * meridian's endpoint onto the prime meridian. Longitude is carried explicitly now, so a pole vertex
   * knows which meridian it belongs to.
   */
  for (let lon = -180; lon < 180; lon += stepDeg) {
    for (let lat = -90; lat < 90; lat += 3) {
      push(lon, lat);
      push(lon, lat + 3);
    }
  }
  return { position: new Float32Array(out), lonLat: new Float32Array(ll) };
}
