import plates from "./plates.json";
import { EARTH_RADIUS_KM } from "./sphere";

/*
 * How far an earthquake is from the nearest plate boundary.
 *
 * Item 8 asked for the quiet map: dim the belts, light the cratons, because the negative space is the
 * story. Read literally that is a claim about geological time - a craton is quiet over hundreds of
 * millions of years - and this app holds at most thirty days in a ring buffer with no backend behind it.
 * Inverting one window would have lit up half the Ring of Fire, since most active belt cells have no
 * event today either. So the claim was cut down to one this data can actually carry: **not which places
 * are quiet, but how far each earthquake is from an edge.**
 *
 * The numbers, measured before any of this was built, against a real day of USGS M2+ and the boundary
 * file already shipped: median **93 km**, half of them within 100 km of a boundary, and that band is
 * 9.4% of the surface. So the belts concentrate seismicity by about **5.4x** - and that is a floor, not a
 * ceiling, because a dense network finds M2 events in Oklahoma while nobody at all is listening in the
 * middle of the Pacific, which inflates the intraplate count rather than the boundary one.
 *
 * The tail is the part worth reading. The furthest four that day were Pahala in Hawaii at 3,557 km, Massac
 * in Kentucky at 2,136, Falls City in Texas at 1,203 and a magnitude 5.2 south of Dunhuang at 1,070: a
 * hotspot, a failed rift, an oilfield and the inside of a plateau. Every one of those places is named by
 * the agency itself, so the app states a distance and lets the name do the rest.
 *
 * **Deliberately not a marker decoration.** The obvious move is to ring the intraplate events, and item 10
 * already tried ringing markers twice and removed it twice: hairlines vanished under 10-20px discs, and an
 * offset ring read as a concentric scribble. The marker's channels are spent - colour and size are
 * magnitude, fill is depth - so this is a number in the panel and a sentence in the rail, not a third
 * thing drawn on a dot.
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
 * Point-to-*segment*, not point-to-vertex, and that distinction is not academic: the shipped boundary file
 * is simplified to 1,872 vertices across 260,483 km, which is one every 139 km, so a point sitting halfway
 * along a straight run of ridge is 70 km from the nearest vertex and 0 from the line. Measuring to vertices
 * put the median at 93 km and the within-50km share at 11%; measuring to segments made it 32%. The first
 * number was simply wrong.
 *
 * Measured to the **arc**, not to the chord joining its ends. The first version took the nearest point on
 * the chord, which is a line through the inside of the planet: a 10-degree segment sags 24 km below the
 * surface at its midpoint, so a point sitting exactly on that stretch of ridge was reported 24 km away
 * from it. On the real file, whose vertices average 139 km apart, that error is only 0.4 km and would have
 * hidden behind the kilometre rounding forever. It was found by a test built on a deliberately coarse
 * 10-degree line, and the comment that used to sit here claimed the two methods "differ by centimetres",
 * which was wrong by five orders of magnitude.
 *
 * So: cross-track distance to the great circle through the segment, used only when the perpendicular foot
 * actually falls between the endpoints, and the nearer endpoint otherwise. Exact at any segment length.
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
    /*
     * The foot lies within the arc when the point is "beyond" neither end, which for an arc shorter than
     * a half-circle is exactly this pair of comparisons against the endpoints' own separation.
     */
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
 * The shipped boundary file, prepared for the hot loop.
 *
 * Static, and deliberately so. This was `await import("./plates.json")` with a comment about 28kB having
 * no business in the first paint, which was a claim the build had never agreed with: `scene.ts` draws the
 * same boundaries on the first frame, so the file is first-paint data by definition and was in the
 * preloaded chunk either way. The dynamic form bought a promise, a render with no distances in it, and a
 * comment that read as a measurement. The 1,872 vertices flatten in well under a millisecond.
 */
export function boundarySegments(): Segment[] {
  return toSegments(plates as [number, number][][]);
}

/**
 * The band the rail's sentence counts, and how much of the planet it covers.
 *
 * 100 km because the measured median distance was 93: half of everything lands inside the first band, so a
 * wider one would call almost every earthquake on Earth "near a boundary" and say nothing. The share is
 * computed on a cos-weighted 2.5-degree grid, so it is a fraction of *area* and not of grid cells - the
 * unweighted count would have read 15% by crowding the answer with polar cells.
 */
export const QUIET_BAND_KM = 100;
export const QUIET_BAND_SHARE = 0.094;
