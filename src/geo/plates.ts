import plates from "./plates.json";
import { toVec3, spanDeg } from "./sphere";

/* The tectonic plate boundaries. The earthquakes were always tracing these and nothing said so, so the Ring
   of Fire read as a coincidence of where dots land. See ARCHITECTURE.md. */

/** Between the graticule and the land, so continents sit on top of the boundaries they contain. */
export const RADIUS_PLATES = 1.0035;

/** Beyond this a segment is a wrap across the antimeridian rather than a real edge. */
const WRAP_DEG = 170;

/** Boundaries as line segment pairs on the sphere. Densified for the same reason the coastlines are: a
 * straight chord between two points 5 degrees apart cuts visibly inside the sphere, and these lines run
 * long and straight across open ocean. */
export function buildPlates(
  lines: readonly (readonly (readonly [number, number])[])[] = plates as [number, number][][],
): { position: Float32Array; lonLat: Float32Array } {
  const out: number[] = [];
  const ll: number[] = [];
  const DENSIFY_DEG = 1.5;

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      /* A boundary that leaves at +180 and re-enters at -180 is one line in the source data, and joining
         those two points draws a chord straight through the planet. See ARCHITECTURE.md. */
      if (Math.abs(b[0] - a[0]) > WRAP_DEG) continue;

      const steps = Math.max(1, Math.ceil(spanDeg(a[0], a[1], b[0], b[1]) / DENSIFY_DEG));
      for (let s = 0; s < steps; s += 1) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const lon0 = a[0] + (b[0] - a[0]) * t0;
        const lat0 = a[1] + (b[1] - a[1]) * t0;
        const lon1 = a[0] + (b[0] - a[0]) * t1;
        const lat1 = a[1] + (b[1] - a[1]) * t1;
        out.push(...toVec3(lon0, lat0, RADIUS_PLATES), ...toVec3(lon1, lat1, RADIUS_PLATES));
        ll.push(lon0, lat0, lon1, lat1);
      }
    }
  }
  return { position: new Float32Array(out), lonLat: new Float32Array(ll) };
}

/** Reorders segments nearest-first from a set of points, for the entrance reveal. See ARCHITECTURE.md. */
export function orderByProximity(
  positions: Float32Array,
  points: readonly { lon: number; lat: number }[],
  lonLat?: Float32Array,
): { position: Float32Array; lonLat: Float32Array | undefined } {
  const segments = positions.length / 6;
  if (segments === 0 || points.length === 0) return { position: positions, lonLat };

  const px = new Float32Array(points.length);
  const py = new Float32Array(points.length);
  const pz = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const [x, y, z] = toVec3(points[i]!.lon, points[i]!.lat, 1);
    px[i] = x;
    py[i] = y;
    pz[i] = z;
  }

  // Squared chord length, never an angle: it is monotonic in the angle and costs no inverse trig
  // across half a million pairs.
  const cost = new Float32Array(segments);
  for (let s = 0; s < segments; s += 1) {
    const i = s * 6;
    let mx = (positions[i]! + positions[i + 3]!) / 2;
    let my = (positions[i + 1]! + positions[i + 4]!) / 2;
    let mz = (positions[i + 2]! + positions[i + 5]!) / 2;
    const len = Math.hypot(mx, my, mz) || 1;
    mx /= len;
    my /= len;
    mz /= len;

    let best = Infinity;
    for (let e = 0; e < points.length; e += 1) {
      const dx = mx - px[e]!;
      const dy = my - py[e]!;
      const dz = mz - pz[e]!;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    cost[s] = best;
  }

  const order = Array.from({ length: segments }, (_, i) => i).sort((a, b) => cost[a]! - cost[b]!);

  const out = new Float32Array(positions.length);
  const outLl = lonLat ? new Float32Array(lonLat.length) : undefined;
  for (let n = 0; n < segments; n += 1) {
    out.set(positions.subarray(order[n]! * 6, order[n]! * 6 + 6), n * 6);
    // Reordering the positions without reordering these would put every segment's geography on some
    // other segment, which is invisible on the globe and draws the map as noise.
    if (outLl && lonLat) outLl.set(lonLat.subarray(order[n]! * 4, order[n]! * 4 + 4), n * 4);
  }
  return { position: out, lonLat: outLl };
}
