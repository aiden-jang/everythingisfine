import { EARTH_RADIUS_KM, toVec3 } from "../geo/sphere";
import plates from "../geo/plates.json";
import { matches } from "../data/filter";
import type { Store } from "../data/store";
import type { Filters, Quake } from "../data/types";

/*
 * A cross-section through the crust, along a line drawn on the map.
 *
 * Every other view in this app answers "where". Depth is the dimension the data carries and the
 * picture cannot show: on a globe or a map it is a filled or hollow ring, which says shallow or deep
 * and nothing about structure. Drawn against distance instead, the same events say what they actually
 * are. A line across Japan puts the Pacific plate on screen diving west at about forty-five degrees,
 * because the earthquakes *are* the slab, and nothing on the surface can show that.
 *
 * This is the one thing the flat map is better at than the globe, which is the argument for the map
 * existing at all. Picking two points on a sphere you are rotating is a guess; picking them on a map
 * is a drag.
 */

export interface SectionLine {
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
}

export interface SectionPoint {
  key: string;
  /** Kilometres from the start of the line, along it. */
  alongKm: number;
  depthKm: number;
  magnitude: number;
  /** Signed kilometres off the line. Kept so a point can fade with how far it reaches. */
  offsetKm: number;
}

export interface Section {
  lengthKm: number;
  halfWidthKm: number;
  points: SectionPoint[];
  /** Deepest event in the corridor, so the axis fits the data rather than a constant. */
  deepestKm: number;
  /** In the corridor but with no depth published. Named rather than silently dropped. */
  withoutDepth: number;
  /** Distances along the line at which it crosses a plate boundary. */
  crossings: number[];
}

/**
 * How wide a band counts as "on the line".
 *
 * Subduction zones are hundreds of kilometres across and a zero-width section would find almost
 * nothing, so every section is really a corridor. 200km each side is wide enough to fill in a slab
 * and narrow enough that two neighbouring margins do not overlap into one smear.
 */
export const SECTION_HALF_WIDTH_KM = 200;

/**
 * Along-track and cross-track distance, by vector algebra rather than by bearings.
 *
 * The bearing formulation needs an `atan2`, a difference of angles that has to be wrapped, and an
 * `asin` whose sign has to be reasoned about; this needs a cross product and two dot products, and
 * gets the sign of the offset for free. Both are exact on a sphere. Only one is easy to read six
 * months later.
 */
function project(
  line: SectionLine, lon: number, lat: number,
): { alongKm: number; offsetKm: number } {
  const a = toVec3(line.fromLon, line.fromLat, 1);
  const b = toVec3(line.toLon, line.toLat, 1);
  const p = toVec3(lon, lat, 1);

  // Normal to the plane of the great circle through the two ends.
  let nx = a[1] * b[2] - a[2] * b[1];
  let ny = a[2] * b[0] - a[0] * b[2];
  let nz = a[0] * b[1] - a[1] * b[0];
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen; ny /= nLen; nz /= nLen;

  // Distance off the plane is the angle out of it, which is what the dot product with the normal is.
  const offAngle = Math.asin(Math.max(-1, Math.min(1, p[0] * nx + p[1] * ny + p[2] * nz)));

  // Dropped onto the plane, the point has an angle from the start measured in the plane's own frame.
  const px = p[0] - Math.sin(offAngle) * nx;
  const py = p[1] - Math.sin(offAngle) * ny;
  const pz = p[2] - Math.sin(offAngle) * nz;
  // The in-plane axis at ninety degrees to the start, pointing towards the end.
  const qx = ny * a[2] - nz * a[1];
  const qy = nz * a[0] - nx * a[2];
  const qz = nx * a[1] - ny * a[0];
  const alongAngle = Math.atan2(
    px * qx + py * qy + pz * qz,
    px * a[0] + py * a[1] + pz * a[2],
  );

  return {
    alongKm: alongAngle * EARTH_RADIUS_KM,
    offsetKm: offAngle * EARTH_RADIUS_KM,
  };
}

/** Great-circle length of the line itself, which is the section's x axis. */
export function sectionLengthKm(line: SectionLine): number {
  const { alongKm } = project(line, line.toLon, line.toLat);
  return Math.abs(alongKm);
}

/**
 * Where the line crosses a plate boundary, as distances along it.
 *
 * The section shows a slab and cannot say why one is there. A tick on the distance axis where the line
 * crosses a plate edge turns the picture into an explanation: the earthquakes start at the boundary and
 * descend away from it, which is the claim a subduction zone makes.
 *
 * Found by sign change in the cross-track offset rather than by intersecting two great circles. The
 * offset is already computed for every event, so this is the same call over the boundary vertices, and
 * a segment whose ends fall on opposite sides of the line has crossed it. Interpolated linearly between
 * the two, which at the 0.15-degree simplification of the boundary data is well inside a pixel.
 *
 * What keeps the far side of the planet out is the range check, not a distance test. The great circle
 * through the two ends is a whole circle, so boundaries cross it everywhere, but a crossing anywhere
 * other than on the section itself lands outside nought to length and is dropped. A guard on the offset
 * was written first and measured against a thousand lines scattered over the globe: it changed nothing,
 * because a crossing whose distance along is inside the section is on the section by construction.
 */
export function plateCrossings(line: SectionLine, lengthKm: number): number[] {
  const out: number[] = [];
  for (const polyline of plates as [number, number][][]) {
    let prev: { alongKm: number; offsetKm: number } | null = null;
    for (const [lon, lat] of polyline) {
      const here = project(line, lon, lat);
      if (
        prev
        && Math.sign(prev.offsetKm) !== Math.sign(here.offsetKm)
        // `atan2` breaks at the antipode of the start, so a segment straddling it has one end near
        // +20,000km and the other near -20,000km. Interpolating between those two is not arithmetic
        // about anything, and it lands at zero, which is inside the section and looks deliberate.
        && Math.abs(here.alongKm - prev.alongKm) < 10_000
      ) {
        const t = Math.abs(prev.offsetKm) / (Math.abs(prev.offsetKm) + Math.abs(here.offsetKm));
        const at = prev.alongKm + (here.alongKm - prev.alongKm) * t;
        if (at >= 0 && at <= lengthKm) out.push(at);
      }
      prev = here;
    }
  }
  return out.sort((a, b) => a - b);
}

export function buildSection(
  store: Store, line: SectionLine, filters: Filters, now: number,
  halfWidthKm = SECTION_HALF_WIDTH_KM,
): Section {
  const lengthKm = sectionLengthKm(line);
  const points: SectionPoint[] = [];
  let deepestKm = 0;
  let withoutDepth = 0;

  store.forEach((quake: Quake) => {
    if (!matches(quake, filters, now)) return;
    const r = quake.primary;
    const { alongKm, offsetKm } = project(line, r.lon, r.lat);
    if (Math.abs(offsetKm) > halfWidthKm) return;
    // Past either end is off the section, not at its nearest end: clamping would pile every event in
    // the wider region onto the two edges and invent a structure that is not there.
    if (alongKm < 0 || alongKm > lengthKm) return;
    if (!Number.isFinite(r.depthKm)) {
      withoutDepth += 1;
      return;
    }
    points.push({
      key: quake.key, alongKm, offsetKm, depthKm: r.depthKm, magnitude: r.magnitude,
    });
    if (r.depthKm > deepestKm) deepestKm = r.depthKm;
  });

  return {
    lengthKm, halfWidthKm, points, deepestKm, withoutDepth,
    crossings: plateCrossings(line, lengthKm),
  };
}
