import { DEG, EARTH_RADIUS_KM } from "./sphere";

/*
 * The far side, and the one thing a globe can show that a map cannot.
 *
 * A wavefront on a sphere does not simply grow: it grows to a great circle a quarter of the world away and
 * then shrinks, closing to a point on the opposite side. The front that has travelled 150 degrees is the
 * same length as the one that travelled 30 - 20,015 km each, against 40,030 km at the widest.
 *
 * No time is claimed anywhere in here. Timing the far side needs a teleseismic path through the mantle, and
 * `arrival.ts` already refused that by capping at 700km. Extending the live ring was measured and rejected:
 * it fades at 17 degrees, 9.4% of the way, and reaching the antipode at x20 would take 166.8 seconds.
 *
 * So this is a figure, not an animation: where the front would be at fixed intervals of arc.
 */

/** Where a front from here closes back to a point. */
export function antipodeOf(lon: number, lat: number): { lon: number; lat: number } {
  const flipped = lon + 180;
  // Wrapped into -180..180 so it sits in the same range every other coordinate here uses.
  const wrapped = ((flipped + 180) % 360 + 360) % 360 - 180;
  return { lon: wrapped, lat: -lat };
}

/** How long the front itself is, at an arc radius from the epicentre. `2 pi R sin(theta)`, which is the
 * whole argument in one line: the sine peaks at 90 degrees and returns. */
export function frontLengthKm(arcDeg: number): number {
  return 2 * Math.PI * EARTH_RADIUS_KM * Math.abs(Math.sin(arcDeg * DEG));
}

/** The arcs drawn, in degrees. Symmetric about 90 on purpose: 30 and 150 are the same length, and seeing
 * the pair is what makes the turnover legible rather than merely stated. */
export const FRONT_ARCS = [30, 60, 90, 120, 150] as const;

/** Points per circle. 120 is a third of a degree of bearing, which reads as a circle at any zoom. */
const STEPS = 120;

/**
 * A circle of constant arc radius around a point, as longitude and latitude. Walked with the
 * destination-point formula: this is a circle on the sphere, not in lon/lat, so it cannot be drawn as an
 * ellipse around the centre.
 */
export function smallCircle(
  lon: number, lat: number, arcDeg: number, steps: number = STEPS,
): { lon: number; lat: number }[] {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  const theta = arcDeg * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const out: { lon: number; lat: number }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * Math.PI * 2;
    const lat2 = Math.asin(sinPhi * cosTheta + cosPhi * sinTheta * Math.cos(bearing));
    const lon2 = lambda + Math.atan2(
      Math.sin(bearing) * sinTheta * cosPhi,
      cosTheta - sinPhi * Math.sin(lat2),
    );
    out.push({ lon: ((lon2 / DEG + 540) % 360) - 180, lat: lat2 / DEG });
  }
  return out;
}

/** The mark on the far side: a small cross, so the point the front closes to is a point. */
export function antipodeCross(lon: number, lat: number, sizeDeg = 3): { lon: number; lat: number }[][] {
  const stretch = 1 / Math.max(0.25, Math.cos(lat * DEG));
  const w = sizeDeg * stretch;
  return [
    [{ lon: lon - w, lat }, { lon: lon + w, lat }],
    [{ lon, lat: Math.max(-89.9, lat - sizeDeg) }, { lon, lat: Math.min(89.9, lat + sizeDeg) }],
  ];
}
