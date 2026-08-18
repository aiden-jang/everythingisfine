import earcut from "earcut";
import { feature } from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import topology from "world-atlas/land-110m.json";
import { midpoint, spanDeg, toVec3 } from "./sphere";

/*
 * Natural Earth 110m, turned into two pieces of geometry: a filled land mesh and a coastline stroke.
 *
 * Vector rather than a satellite texture, for the reason in DESIGN.md section 4: a photographic
 * earth puts green, ochre and white across the whole sphere and every one of those competes with
 * the data ramp, so the viewer ends up reading hue in two languages at once. Land is chrome here.
 *
 * The fill is a flat colour, so it needs no resolution at all. Only the boundary does, and the
 * boundary is a line. That is what makes vector affordable: the expensive half of "sharp at every
 * zoom" turns out to be the cheap half.
 */

/** Ring edges longer than this get points inserted, so the coastline hugs the sphere. */
const DENSIFY_DEG = 1.5;

/**
 * Uniform subdivision passes on the filled triangles.
 *
 * Two was the first guess, on the reasoning that it would leave a worst-case edge near 10 degrees.
 * Measuring said 31.3 degrees, sagging 0.037 of a radius below the sphere: eighteen times the lift
 * that had been put there to clear it, so the ocean was cutting through the middle of every large
 * landmass. The guess was wrong because it assumed something about the triangles earcut emits in a
 * continent's interior, and earcut makes no such promise.
 *
 * Three halves that to 15.6 degrees at four times the triangles. It is not raised further because
 * the sag no longer causes holes at all (see the depth note in globe/scene.ts) and only pulls the
 * fill fractionally inside its own coastline, which the stroke covers.
 */
const SUBDIVISIONS = 3;

const R_SPHERE = 1;
/** Flush with the sphere. Nothing is gained by lifting it: the fill is ordered, not depth-tested. */
const RADIUS_LAND = 1;
const RADIUS_COAST = 1.004;
export const RADIUS_SPHERE = R_SPHERE;
export const RADIUS_GRATICULE = 1.003;

/**
 * Outer shell carrying the rim light.
 *
 * Exported because the camera has to stay outside it. Fly inside an additively blended backside
 * shell and it stops being a halo at the horizon and becomes a wash over the entire screen. The
 * two constants live one import apart rather than as unrelated numbers in two files.
 */
/** Between the coastline and the markers: night dims the geography and never the data. */
export const RADIUS_NIGHT = 1.0045;
export const RADIUS_ATMOSPHERE = 1.3;

type Ring = number[][];

/**
 * Every landmass as a polygon: one outer ring, then any holes.
 *
 * `objects.land` is a GeometryCollection, so `feature()` hands back a FeatureCollection whose
 * members are a mix of Polygon and MultiPolygon. Both get flattened to the same shape here so that
 * nothing downstream has to care which one a given landmass happened to be.
 */
function rings(): Ring[][] {
  const topo = topology as unknown as Topology;
  const land = feature(topo, topo.objects.land as GeometryObject) as
    | Feature<Polygon | MultiPolygon>
    | FeatureCollection<Polygon | MultiPolygon>;

  const features = land.type === "FeatureCollection" ? land.features : [land];
  const out: Ring[][] = [];
  for (const f of features) {
    if (f.geometry.type === "Polygon") out.push(f.geometry.coordinates as unknown as Ring[]);
    else for (const p of f.geometry.coordinates) out.push(p as unknown as Ring[]);
  }
  return out;
}

/** Insert points until no edge exceeds `DENSIFY_DEG`, so a straight edge becomes a curved one. */
function densify(ring: Ring): Ring {
  const out: Ring = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    out.push(a);
    const steps = Math.floor(spanDeg(a[0]!, a[1]!, b[0]!, b[1]!) / DENSIFY_DEG);
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      let d = b[0]! - a[0]!;
      if (d > 180) d -= 360;
      else if (d < -180) d += 360;
      out.push([a[0]! + d * t, a[1]! + (b[1]! - a[1]!) * t]);
    }
  }
  return out;
}

/**
 * Split every triangle into four, using a shared cache for edge midpoints.
 *
 * Uniform rather than adaptive on purpose. Subdividing only the triangles that need it leaves a
 * T-junction wherever a split triangle meets an unsplit neighbour, and on a flat fill that shows up
 * as a hairline of ocean running through the middle of a continent.
 */
function subdivide(verts: number[], tris: number[]): { verts: number[]; tris: number[] } {
  const out: number[] = [];
  const cache = new Map<number, number>();

  const mid = (i: number, j: number): number => {
    const key = i < j ? i * 1e7 + j : j * 1e7 + i;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [lon, lat] = midpoint(verts[i * 2]!, verts[i * 2 + 1]!, verts[j * 2]!, verts[j * 2 + 1]!);
    const idx = verts.length / 2;
    verts.push(lon, lat);
    cache.set(key, idx);
    return idx;
  };

  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { verts, tris: out };
}

export interface LandGeometry {
  /** Shared vertices for the filled shell, already on the sphere. */
  position: Float32Array;
  /** Triangle indices into `position`. Indexed, because subdivision shares every midpoint between
   *  two triangles and a soup would store each one twice. */
  index: Uint32Array;
  /** How many triangles arrived wound the wrong way. Zero would mean the source became consistent. */
  flipped: number;
  /** Line segment pairs for the coastline stroke. */
  coast: Float32Array;
  stats: {
    vertices: number;
    triangles: number;
    segments: number;
    /** Longest triangle edge left after subdivision, in degrees. */
    maxEdgeDeg: number;
    /** How far that edge chords inside the sphere, in radii. Now a fill-vs-coastline gap, not a hole. */
    maxPullIn: number;
  };
}

export function buildLand(): LandGeometry {
  const polygons = rings();
  const verts: number[] = [];
  const tris: number[] = [];
  const coast: number[] = [];

  for (const polygon of polygons) {
    const flat: number[] = [];
    const holes: number[] = [];
    const base = verts.length / 2;

    polygon.forEach((raw, ringIndex) => {
      // GeoJSON closes every ring by repeating the first point. earcut treats that as a degenerate
      // edge, so it comes off before triangulation and goes back on for the stroke.
      const closed = densify(raw.slice(0, -1));
      if (ringIndex > 0) holes.push(flat.length / 2);
      for (const [lon, lat] of closed) flat.push(lon!, lat!);

      for (let i = 0; i < closed.length; i += 1) {
        const a = closed[i]!;
        const b = closed[(i + 1) % closed.length]!;
        coast.push(...toVec3(a[0]!, a[1]!, RADIUS_COAST), ...toVec3(b[0]!, b[1]!, RADIUS_COAST));
      }
    });

    const indices = earcut(flat, holes, 2);
    for (const i of indices) tris.push(base + i);
    for (const v of flat) verts.push(v);
  }

  let mesh = { verts, tris };
  for (let i = 0; i < SUBDIVISIONS; i += 1) mesh = subdivide(mesh.verts, mesh.tris);

  const count = mesh.verts.length / 2;
  const position = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    const [x, y, z] = toVec3(mesh.verts[v * 2]!, mesh.verts[v * 2 + 1]!, RADIUS_LAND);
    position[v * 3] = x;
    position[v * 3 + 1] = y;
    position[v * 3 + 2] = z;
  }

  // Measured, and kept measured. This number is the reason SUBDIVISIONS is what it is, and it is
  // not derivable from the subdivision count alone: it depends on the longest edge earcut happened
  // to emit inside a continent. A future data or densify change moves it silently otherwise.
  let maxEdgeDeg = 0;
  for (let t = 0; t < mesh.tris.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = mesh.tris[t + e]!;
      const b = mesh.tris[t + ((e + 1) % 3)]!;
      const s = spanDeg(
        mesh.verts[a * 2]!, mesh.verts[a * 2 + 1]!, mesh.verts[b * 2]!, mesh.verts[b * 2 + 1]!,
      );
      if (s > maxEdgeDeg) maxEdgeDeg = s;
    }
  }

  /*
   * Every triangle wound so its face points away from the centre.
   *
   * The land fill is drawn with `depthTest: false` and relies on back-face culling to hide the far
   * hemisphere, which is the fix for the fill sagging into the ocean sphere. Culling only works if the
   * winding is consistent, and it was not: earcut preserves the winding of the ring it is given, and
   * Natural Earth's polygons are not all wound the same way.
   *
   * **1,559 of 303,360 triangles faced inward**, so their far-side copies survived culling and their
   * near-side copies were removed. The symptom is landmasses from the other side of the planet showing
   * faintly through the ocean, which looks like a transparency setting rather than like a bug.
   */
  const index = new Uint32Array(mesh.tris);
  let flipped = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]! * 3;
    const b = index[i + 1]! * 3;
    const c = index[i + 2]! * 3;
    const ux = position[b]! - position[a]!;
    const uy = position[b + 1]! - position[a + 1]!;
    const uz = position[b + 2]! - position[a + 2]!;
    const vx = position[c]! - position[a]!;
    const vy = position[c + 1]! - position[a + 1]!;
    const vz = position[c + 2]! - position[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    // The outward direction at a vertex on a unit sphere is the vertex itself.
    if (nx * position[a]! + ny * position[a + 1]! + nz * position[a + 2]! < 0) {
      const swap = index[i + 1]!;
      index[i + 1] = index[i + 2]!;
      index[i + 2] = swap;
      flipped += 1;
    }
  }

  return {
    position,
    index,
    flipped,
    coast: new Float32Array(coast),
    stats: {
      vertices: count,
      triangles: mesh.tris.length / 3,
      segments: coast.length / 6,
      maxEdgeDeg,
      maxPullIn: 1 - Math.cos((maxEdgeDeg / 2) * (Math.PI / 180)),
    },
  };
}
