import { DEG, EARTH_RADIUS_KM, toVec3 } from "../geo/sphere";
import plates from "../geo/plates.json";
import { matches } from "../data/filter";
import type { Store } from "../data/store";
import type { Filters, Quake } from "../data/types";
import type { SlabPoint } from "../geo/slab";

/* A cross-section through the crust, along a line drawn on the map. See ARCHITECTURE.md#srcappsectionts. */

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
  /** The committed deep-seismicity table where it falls in this corridor. A separate array, because these
   * are five years of M4.5-and-deeper-than-300km rather than this window's readings, and everything
   * downstream has to draw them differently and refuse to let them be clicked. */
  slab: SectionPoint[];
}

/**
 * How wide a band counts as "on the line". Subduction zones are hundreds of kilometres across, so a
 * zero-width section finds almost nothing. 200km each side fills a slab without smearing two margins together.
 */
export const SECTION_HALF_WIDTH_KM = 200;

/**
 * How long a section offered from the panel is, end to end. 300km either side reaches from the trench across
 * the arc to the deep events behind it. Longer starts collecting the next margin.
 */
export const SECTION_DEFAULT_KM = 600;

/** Kilometres in a degree of latitude, from the mean radius. Same figure the scale bar uses. */
const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180;

/** A section through a point, across the local trend rather than along it. See ARCHITECTURE.md#srcappsectionts. */
export function sectionThrough(
  lon: number,
  lat: number,
  trendDeg: number | null,
  lengthKm = SECTION_DEFAULT_KM,
): SectionLine {
  // Across the trend, not along it. A null trend leaves this at 90, which is due east.
  const bearing = ((trendDeg ?? 0) + 90) * (Math.PI / 180);
  const halfDeg = lengthKm / 2 / KM_PER_DEGREE;
  const dLat = halfDeg * Math.cos(bearing);
  // East-west degrees stretch by 1/cos(lat), and the guard is not decoration: at 85 degrees the factor is
  // 11 and at the pole it is infinite.
  const scale = Math.max(0.02, Math.cos((lat * Math.PI) / 180));
  const dLon = (halfDeg * Math.sin(bearing)) / scale;

  /* Always read west to east, and south to north when it is neither. Left to the bearing arithmetic, a
     north-south trench reads top to bottom while an east-west one reads left to right. See ARCHITECTURE.md#srcappsectionts. */
  const EPS = 1e-9;
  const flip = dLon < -EPS || (Math.abs(dLon) <= EPS && dLat < 0);
  const eastward = flip ? -dLon : dLon;
  const northward = flip ? -dLat : dLat;

  const wrap = (v: number): number => ((((v + 180) % 360) + 360) % 360) - 180;
  const clampLat = (v: number): number => Math.max(-90, Math.min(90, v));
  return {
    fromLon: wrap(lon - eastward),
    fromLat: clampLat(lat - northward),
    toLon: wrap(lon + eastward),
    toLat: clampLat(lat + northward),
  };
}

/** The two edges of the corridor, as lines that can be drawn beside the centre. See ARCHITECTURE.md#srcappsectionts. */
export function sectionEdges(
  line: SectionLine,
  halfWidthKm = SECTION_HALF_WIDTH_KM,
): [SectionLine, SectionLine] {
  const a = toVec3(line.fromLon, line.fromLat, 1);
  const b = toVec3(line.toLon, line.toLat, 1);
  let nx = a[1] * b[2] - a[2] * b[1];
  let ny = a[2] * b[0] - a[0] * b[2];
  let nz = a[0] * b[1] - a[1] * b[0];
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  const t = halfWidthKm / EARTH_RADIUS_KM;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const shift = (v: readonly [number, number, number], side: number): [number, number] => {
    const x = v[0] * cos + nx * side * sin;
    const y = v[1] * cos + ny * side * sin;
    const z = v[2] * cos + nz * side * sin;
    const r = Math.hypot(x, y, z) || 1;
    return [Math.atan2(x / r, z / r) / DEG, Math.asin(Math.max(-1, Math.min(1, y / r))) / DEG];
  };
  const edge = (side: number): SectionLine => {
    const [fromLon, fromLat] = shift(a, side);
    const [toLon, toLat] = shift(b, side);
    return { fromLon, fromLat, toLon, toLat };
  };
  return [edge(1), edge(-1)];
}

/**
 * Along-track and cross-track distance, by vector algebra rather than by bearings. The bearing form needs an
 * `atan2`, a wrapped difference of angles and an `asin` whose sign has to be reasoned about; this needs a
 * cross product and two dot products, and gets the sign for free.
 */
function project(line: SectionLine, lon: number, lat: number): { alongKm: number; offsetKm: number } {
  const a = toVec3(line.fromLon, line.fromLat, 1);
  const b = toVec3(line.toLon, line.toLat, 1);
  const p = toVec3(lon, lat, 1);

  // Normal to the plane of the great circle through the two ends.
  let nx = a[1] * b[2] - a[2] * b[1];
  let ny = a[2] * b[0] - a[0] * b[2];
  let nz = a[0] * b[1] - a[1] * b[0];
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

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
  const alongAngle = Math.atan2(px * qx + py * qy + pz * qz, px * a[0] + py * a[1] + pz * a[2]);

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
 * Where the line crosses a plate boundary, as distances along it. The tick turns the picture into an
 * explanation: the earthquakes start at the boundary and descend away from it. See ARCHITECTURE.md#srcappsectionts.
 */
export function plateCrossings(line: SectionLine, lengthKm: number): number[] {
  const out: number[] = [];
  for (const polyline of plates as [number, number][][]) {
    let prev: { alongKm: number; offsetKm: number } | null = null;
    for (const [lon, lat] of polyline) {
      const here = project(line, lon, lat);
      if (
        prev &&
        Math.sign(prev.offsetKm) !== Math.sign(here.offsetKm) &&
        // `atan2` breaks at the antipode of the start, so a segment straddling it has one end near
        // +20,000km and the other near -20,000km. Interpolating lands at zero, which looks deliberate.
        Math.abs(here.alongKm - prev.alongKm) < 10_000
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

/*
 * The slab, in the one drawing where its shape cannot hide. On the globe the depth sink is a parallax that
 * appears only obliquely - the offset is radial, so it is zero at the sub-camera point. A cross-section is a
 * depth axis drawn flat, and a dipping plane reads as one from any angle.
 */
export function buildSection(
  store: Store,
  line: SectionLine,
  filters: Filters,
  now: number,
  halfWidthKm = SECTION_HALF_WIDTH_KM,
  slabTable: readonly SlabPoint[] = [],
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
    // Past either end is off the section, not at its nearest end. Clamping would pile every event in the
    // wider region onto the two edges and invent a structure that is not there.
    if (alongKm < 0 || alongKm > lengthKm) return;
    if (!Number.isFinite(r.depthKm)) {
      withoutDepth += 1;
      return;
    }
    points.push({
      key: quake.key,
      alongKm,
      offsetKm,
      depthKm: r.depthKm,
      magnitude: r.magnitude,
    });
    if (r.depthKm > deepestKm) deepestKm = r.depthKm;
  });

  /*
   * Counted into `deepestKm`, which decides the axis. With the slab on, a corridor across Tonga runs to 665km
   * rather than 250, so the live marks compress near the surface. That is the honest picture - the footer
   * prints the depth it drew to - and it is the whole reason to put them here.
   */
  const slab: SectionPoint[] = [];
  for (let i = 0; i < slabTable.length; i += 1) {
    const [lon, lat, depthKm, magnitude] = slabTable[i]!;
    const { alongKm, offsetKm } = project(line, lon, lat);
    if (Math.abs(offsetKm) > halfWidthKm) continue;
    if (alongKm < 0 || alongKm > lengthKm) continue;
    // Keyed by index: these are not events the app holds, so they have no key anything else would know.
    slab.push({ key: `slab:${i}`, alongKm, offsetKm, depthKm, magnitude });
    if (depthKm > deepestKm) deepestKm = depthKm;
  }

  return {
    lengthKm,
    halfWidthKm,
    points,
    deepestKm,
    withoutDepth,
    slab,
    crossings: plateCrossings(line, lengthKm),
  };
}
