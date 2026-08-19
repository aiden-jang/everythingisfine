import earcut from "earcut";
import { feature } from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import topology from "world-atlas/land-110m.json";
import { spanDeg, toVec3 } from "./sphere";

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
 * Three brings it to 10.1 degrees at four times the triangles. It is not raised further because
 * the sag no longer causes holes at all (see the depth note in globe/scene.ts) and only pulls the
 * fill fractionally inside its own coastline, which the stroke covers.
 */
const SUBDIVISIONS = 3;

/**
 * Widest a triangle may be, in degrees of longitude, before it is split rather than subdivided.
 *
 * Ninety rather than a hair under 180, so that three uniform passes leave the children of a split
 * triangle no coarser than the ones the continents already produce. It is a margin, not a
 * measurement: a 200-degree triangle drew a pale wash and streaks, and nothing said the threshold
 * for that was exactly 180.
 */
const MAX_TRI_SPAN_DEG = 90;

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
export function rings(): Ring[][] {
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

/**
 * Longitudes made continuous around a ring, so a landmass that crosses the date line stays one shape.
 *
 * Three rings in Natural Earth hold both +180 and -180, the largest being the 1,320-point Eurasia
 * ring, which crosses the antimeridian exactly twice: out at 178.6E and back at 180W. Read literally
 * it teleports across the world and back, which makes it self-intersecting in longitude and latitude,
 * and earcut promises nothing about a polygon that is not simple. It emitted wedges a hundred and
 * fifty degrees long fanning out of the date line across Siberia, each one a needle a quarter of a
 * degree thick: no area worth seeing on a globe, a hairline across the ocean on a map. The seam
 * filter caught the ones wider than half the world and had no reason to catch these.
 *
 * Unwrapping runs the coastline past 180 rather than jumping back, which is what the shape actually
 * does. Everything downstream already handles it: `toVec3` takes 191 degrees the same as -169, the
 * seam filter now sees a two-degree triangle where it saw a spanning one, and on the map the overshoot
 * lands exactly where the repeated copy draws it, so the seam closes rather than opening a gap.
 *
 * The recentring is not optional. Unwrapping accumulates from wherever the ring happens to start, and
 * this ring starts inside the Chukotka tip, which leaves the whole of Eurasia a full turn to the west:
 * correct on a globe, and drawn into the neighbouring copy of the map.
 */
export function unwrap(ring: Ring): { ring: Ring; mean: number } {
  const out: Ring = [ring[0]!];
  let prev = ring[0]![0]!;
  let sum = prev;
  for (let i = 1; i < ring.length; i += 1) {
    let lon = ring[i]![0]!;
    // Nearest equivalent to the point before it, not the nearest to zero.
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, ring[i]![1]!]);
    prev = lon;
    sum += lon;
  }
  return { ring: out, mean: sum / out.length };
}

/** Whole turns to add so a ring's longitudes sit around the prime meridian rather than a turn away. */
export function recentre(mean: number): number {
  const turns = Math.round(mean / 360);
  // Not `-turns * 360`: that gives negative zero for the common case, which is the same number and a
  // different one to anything comparing identities.
  return turns === 0 ? 0 : -turns * 360;
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
    /*
     * A plain average, not the seam-aware midpoint.
     *
     * That helper takes the short way round the date line and folds its answer back into plus or
     * minus 180, which is right for two points on a sphere and wrong for a mesh being kept in one
     * continuous frame: `unwrap` runs a coastline past 180 on purpose, and folding the midpoint of
     * two vertices at 185 and 183 back to -175 tears the triangle across the whole world. That is
     * the same mistake as recovering longitude with atan2, one layer down.
     *
     * Safe because every triangle reaching here spans less than half the world in that frame, which
     * is what the seam filter above guarantees.
     */
    const lon = (verts[i * 2]! + verts[j * 2]!) / 2;
    const lat = (verts[i * 2 + 1]! + verts[j * 2 + 1]!) / 2;
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
  /**
   * The longitude and latitude each vertex was triangulated in, per vertex.
   *
   * The flat map used to recover these from the sphere position with `atan2`, which is wrong in a way
   * that only shows once something interpolates *between* two vertices. `densify` walks the shorter way
   * round the date line and emits longitudes past 180; earcut triangulates happily in that space; and
   * `atan2` then folds 180.5 back to -179.5, so a triangle that was two degrees wide is drawn spanning
   * the world. Carrying the original values removes the guesswork rather than patching each symptom.
   */
  lonLat: Float32Array;
  /** How many triangles arrived wound the wrong way. Zero would mean the source became consistent. */
  flipped: number;
  /** How many triangles were bisected for being too wide to draw. Zero would mean no ring spans 180. */
  split: number;
  /** Line segment pairs for the coastline stroke. */
  coast: Float32Array;
  /** Lon/lat for each coastline vertex, in the same order as `coast`. */
  coastLonLat: Float32Array;
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
  const coastLonLat: number[] = [];

  for (const polygon of polygons) {
    const flat: number[] = [];
    const holes: number[] = [];
    const base = verts.length / 2;
    let polyShift = 0;

    polygon.forEach((raw, ringIndex) => {
      // GeoJSON closes every ring by repeating the first point. earcut treats that as a degenerate
      // edge, so it comes off before triangulation and goes back on for the stroke.
      const un = unwrap(raw.slice(0, -1) as Ring);
      /*
       * One shift for the whole polygon, taken from its outer ring.
       *
       * Recentring each ring on its own mean put a hole a full turn away from the coastline that
       * contains it, and earcut duly stitched the two together with triangles three hundred and
       * sixty degrees wide. A hole belongs to an outline; they have to be in the same frame.
       */
      if (ringIndex === 0) polyShift = recentre(un.mean);
      const closed = densify(
        polyShift === 0 ? un.ring : un.ring.map(([lon, lat]) => [lon! + polyShift, lat!]),
      );
      if (ringIndex > 0) holes.push(flat.length / 2);
      for (const [lon, lat] of closed) flat.push(lon!, lat!);

      for (let i = 0; i < closed.length; i += 1) {
        const a = closed[i]!;
        const b = closed[(i + 1) % closed.length]!;
        /*
         * Segments that cross the antimeridian are dropped, as the plate boundaries already drop
         * theirs.
         *
         * On a globe such a segment is a short hop across the date line and looks right. Flattened it
         * is a line the full width of the world, and Antarctica and eastern Russia drew a band across
         * the map. The fragment-derivative trick that catches spanning *triangles* cannot catch these:
         * a line one pixel wide has almost no derivative along its length however far it reaches.
         *
         * A dropped segment costs a one-pixel gap at 180 degrees on the globe, which is the cheapest
         * thing on offer.
         */
        if (Math.abs(b[0]! - a[0]!) > 180) continue;
        coast.push(...toVec3(a[0]!, a[1]!, RADIUS_COAST), ...toVec3(b[0]!, b[1]!, RADIUS_COAST));
        coastLonLat.push(a[0]!, a[1]!, b[0]!, b[1]!);
      }
    });

    const indices = earcut(flat, holes, 2);
    for (const i of indices) tris.push(base + i);
    for (const v of flat) verts.push(v);
  }

  /*
   * Wide triangles are split here, in longitude and latitude, before anything subdivides them.
   *
   * They used to be dropped, on the reasoning that earcut works in degrees so a triangle wider than
   * half the world must be crossing the date line and nothing else is. That is false for exactly one
   * polygon and it is the largest one. `unwrap` runs Eurasia past 180 on purpose so Chukotka stays
   * attached, which leaves that ring spanning about 200 degrees from Portugal, and earcut fills a
   * 200-degree polygon with some triangles that reach most of the way across it. Forty-four of them
   * were real Asian interior, and deleting them cut chord-edged holes through Siberia: the fill and
   * the coastline both absent inside a straight-sided wedge, on the one landmass big enough for it.
   *
   * Nothing here needs dropping. Every ring is unwrapped into one continuous frame before earcut sees
   * it, so no triangle's vertices straddle the seam; a wide triangle is wide because its polygon is,
   * and it is honest geography. Keeping them as they came is not the answer either, and the render
   * says so: a 200-degree triangle draws a pale wash and streaks across Asia. Split until nothing is
   * wide and both problems go.
   *
   * Bisecting the widest edge rather than clipping against a meridian, because the midpoint of two
   * longitudes in a continuous frame is their average and needs no case analysis, and because the
   * uniform pass below is already the thing that turns flat triangles into a sphere.
   *
   * The split is adaptive, which leaves a T-junction where a split triangle meets an unsplit
   * neighbour, and the note on `subdivide` is right that those show as hairlines on a flat fill. Not
   * here: every vertex this introduces sits on the straight line between two existing ones in the
   * frame the map is drawn in, so on the map the two sides coincide exactly. On the globe they differ
   * by the sagitta of an edge already an order finer than `maxPullIn`, which is the gap the coastline
   * stroke is there to cover.
   */
  const flatTris: number[] = [];
  let split = 0;
  const splitMids = new Map<number, number>();
  const lonOf = (v: number): number => verts[v * 2]!;
  /** Shared by pair, so two wide neighbours cut a common edge in the same place. */
  const bisect = (i: number, j: number): number => {
    const key = i < j ? i * 1e7 + j : j * 1e7 + i;
    const hit = splitMids.get(key);
    if (hit !== undefined) return hit;
    const idx = verts.length / 2;
    verts.push((verts[i * 2]! + verts[j * 2]!) / 2, (verts[i * 2 + 1]! + verts[j * 2 + 1]!) / 2);
    splitMids.set(key, idx);
    return idx;
  };

  /*
   * Depth is a backstop, not a budget: 200 degrees needs three levels to clear 90 and the cap is
   * eight. It exists so a degenerate triangle cannot recurse forever, and it emits rather than drops
   * when it runs out, because a wash is a worse bug than a hole only until the hole is the one on
   * screen.
   */
  const emit = (a: number, b: number, c: number, depth: number): void => {
    const lons = [lonOf(a), lonOf(b), lonOf(c)];
    if (Math.max(...lons) - Math.min(...lons) <= MAX_TRI_SPAN_DEG || depth === 0) {
      flatTris.push(a, b, c);
      return;
    }
    split += 1;
    const ab = Math.abs(lonOf(a) - lonOf(b));
    const bc = Math.abs(lonOf(b) - lonOf(c));
    const ca = Math.abs(lonOf(c) - lonOf(a));
    // Each child keeps the parent's winding, which the back-face cull below depends on.
    if (ab >= bc && ab >= ca) {
      const m = bisect(a, b);
      emit(a, m, c, depth - 1);
      emit(m, b, c, depth - 1);
    }
    else if (bc >= ca) {
      const m = bisect(b, c);
      emit(b, m, a, depth - 1);
      emit(m, c, a, depth - 1);
    }
    else {
      const m = bisect(c, a);
      emit(c, m, b, depth - 1);
      emit(m, a, b, depth - 1);
    }
  };

  for (let i = 0; i < tris.length; i += 3) emit(tris[i]!, tris[i + 1]!, tris[i + 2]!, 8);

  let mesh = { verts, tris: flatTris };
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
  const lonLat = new Float32Array(mesh.verts);
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
    lonLat,
    flipped,
    split,
    coast: new Float32Array(coast),
    coastLonLat: new Float32Array(coastLonLat),
    stats: {
      vertices: count,
      triangles: index.length / 3,
      segments: coast.length / 6,
      maxEdgeDeg,
      maxPullIn: 1 - Math.cos((maxEdgeDeg / 2) * (Math.PI / 180)),
    },
  };
}
