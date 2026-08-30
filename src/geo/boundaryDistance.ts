import plates from "./plates.json";
import { EARTH_RADIUS_KM } from "./sphere";

/* How far each earthquake is from the nearest plate boundary. Measured against a real day of USGS M2+:
   median 93 km, half within 100 km, and that band is 9.4% of the surface - so the belts concentrate
   seismicity by about 5.4x. See ARCHITECTURE.md. */

/** A boundary segment as two unit vectors' worth of arithmetic, prepared once. */
export interface Segment {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
}

/** Beyond this a segment is a wrap across the antimeridian rather than a real edge, as in `plates.ts`. */
const WRAP_DEG = 170;
const DEG = Math.PI / 180;

/** The boundary lines, flattened into segments in three-space so the hot loop has no trigonometry. */
export function toSegments(
  lines: readonly (readonly (readonly [number, number])[])[],
): Segment[] {
  const out: Segment[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      if (Math.abs(a[0] - b[0]) > WRAP_DEG) continue;
      const [ax, ay, az] = unit(a[0], a[1]);
      const [bx, by, bz] = unit(b[0], b[1]);
      out.push({ ax, ay, az, bx, by, bz });
    }
  }
  return out;
}

function unit(lon: number, lat: number): [number, number, number] {
  const la = lat * DEG;
  const lo = lon * DEG;
  const c = Math.cos(la);
  return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
}

/** Great-circle distance to the nearest segment, in km. See ARCHITECTURE.md. */
export function nearestBoundaryKm(
  lon: number, lat: number, segments: readonly Segment[],
): number | null {
  if (segments.length === 0) return null;
  const [px, py, pz] = unit(lon, lat);
  let best = Infinity;
  for (const s of segments) {
    const ab = s.ax * s.bx + s.ay * s.by + s.az * s.bz;
    const pa = px * s.ax + py * s.ay + pz * s.az;
    const pb = px * s.bx + py * s.by + pz * s.bz;
    // Normal to the plane the segment's great circle lies in.
    const nx = s.ay * s.bz - s.az * s.by;
    const ny = s.az * s.bx - s.ax * s.bz;
    const nz = s.ax * s.by - s.ay * s.bx;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    let angle: number;
    // The foot lies within the arc when the point is beyond neither end, which for an arc shorter than a
    // half-circle is exactly this pair of comparisons against the endpoints' own separation.
    if (nLen > 1e-12 && pa >= ab && pb >= ab) {
      angle = Math.asin(Math.min(1, Math.abs((px * nx + py * ny + pz * nz) / nLen)));
    } else {
      angle = Math.min(Math.acos(Math.max(-1, Math.min(1, pa))),
        Math.acos(Math.max(-1, Math.min(1, pb))));
    }
    if (angle < best) best = angle;
  }
  return best * EARTH_RADIUS_KM;
}

/**
 * The shipped boundary file, prepared for the hot loop. Static, deliberately: `scene.ts` draws the same
 * boundaries on the first frame, so it is first-paint data by definition and was in the preloaded chunk
 * either way. The dynamic form bought a promise and a render with no distances in it.
 */
export function boundarySegments(): Segment[] {
  return toSegments(plates as [number, number][][]);
}

/**
 * The band the rail's sentence counts, and how much of the planet it covers. 100 km because the measured
 * median was 93; a wider band would call almost every earthquake on Earth "near a boundary". The share is
 * computed on a cos-weighted 2.5-degree grid, so it is a fraction of area - unweighted it reads 15%.
 */
export const QUIET_BAND_KM = 100;
export const QUIET_BAND_SHARE = 0.094;
