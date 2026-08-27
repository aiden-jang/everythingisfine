import plates from "./plates.json";
import { EARTH_RADIUS_KM } from "./sphere";

/*
 * How far an earthquake is from the nearest plate boundary.
 *
 * The original ask was the quiet map: dim the belts, light the cratons. Read literally that is a claim about
 * geological time, and this app holds at most thirty days - inverting one window lights up half the Ring of
 * Fire, because most active belt cells have no event today either. So the claim was cut down to one this
 * data can carry: not which places are quiet, but how far each earthquake is from an edge.
 *
 * Measured against a real day of USGS M2+: median 93 km, half within 100 km, and that band is 9.4% of the
 * surface. So the belts concentrate seismicity by about 5.4x - a floor, not a ceiling, because a dense
 * network finds M2 events in Oklahoma while nobody is listening in the middle of the Pacific.
 *
 * Deliberately not a marker decoration. The marker's channels are spent - colour and size are magnitude,
 * fill is depth - so this is a number in the panel and a sentence in the rail.
 */

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

/**
 * Great-circle distance to the nearest segment, in km.
 *
 * Point-to-segment, not point-to-vertex. The shipped boundary file is simplified to one vertex every 139 km,
 * so a point halfway along a straight run of ridge is 70 km from the nearest vertex and 0 from the line:
 * measuring to vertices put the within-50km share at 11%, and to segments at 32%.
 *
 * Measured to the arc, not to the chord joining its ends. The chord is a line through the inside of the
 * planet: a 10-degree segment sags 24 km below the surface at its midpoint. On the real file that error is
 * 0.4 km and would have hidden behind the kilometre rounding forever.
 *
 * So: cross-track distance to the great circle, used only when the perpendicular foot falls between the
 * endpoints, and the nearer endpoint otherwise.
 */
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
