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

/**
 * Midpoint of two points in degrees.
 *
 * Averaging longitudes is wrong across the antimeridian: the midpoint of 179 and -179 is 180, not
 * zero. Natural Earth clips its geometry at the antimeridian so no real edge should span it, but a
 * silent wrong answer here draws a band straight across the map, so it is handled rather than
 * assumed away.
 */
export function midpoint(
  aLon: number, aLat: number, bLon: number, bLat: number,
): [number, number] {
  let d = bLon - aLon;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  let lon = aLon + d / 2;
  if (lon > 180) lon -= 360;
  else if (lon < -180) lon += 360;
  return [lon, (aLat + bLat) / 2];
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
export function graticule(stepDeg: number, radius: number): Float32Array {
  const out: number[] = [];
  const push = (lon: number, lat: number): void => {
    out.push(...toVec3(lon, lat, radius));
  };

  for (let lat = -90 + stepDeg; lat <= 90 - stepDeg; lat += stepDeg) {
    for (let lon = -180; lon < 180; lon += 3) {
      push(lon, lat);
      push(lon + 3, lat);
    }
  }
  for (let lon = -180; lon < 180; lon += stepDeg) {
    for (let lat = -90; lat < 90; lat += 3) {
      push(lon, lat);
      push(lon, lat + 3);
    }
  }
  return new Float32Array(out);
}
