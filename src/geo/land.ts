import earcut from "earcut";
import { feature } from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import topology from "world-atlas/land-110m.json";
import { spanDeg, toVec3 } from "./sphere";

/*
 * Natural Earth 110m, as a filled land mesh and a coastline stroke.
 *
 * Vector rather than a satellite texture: a photographic earth puts green, ochre and white across the
 * sphere and every one competes with the data ramp. Land is chrome here.
 *
 * The fill is a flat colour and needs no resolution at all. Only the boundary does, and a boundary is a line.
 */

/** Ring edges longer than this get points inserted, so the coastline hugs the sphere. */
const DENSIFY_DEG = 1.5;

/**
 * Uniform subdivision passes on the filled triangles.
 *
 * Measure, do not guess: two passes was expected to leave a worst-case edge near 10 degrees and left 31.3,
 * sagging 0.037 of a radius below the sphere, so the ocean cut through the middle of every large landmass.
 * earcut promises nothing about the triangles it emits in a continent's interior.
 */
const SUBDIVISIONS = 3;

/**
 * Widest a triangle may be, in degrees of longitude, before it is split rather than subdivided. Ninety is a
 * margin rather than a measurement: a 200-degree triangle drew a wash and streaks, and nothing said 180.
 */
const MAX_TRI_SPAN_DEG = 90;

const R_SPHERE = 1;
/** Flush with the sphere. Nothing is gained by lifting it: the fill is ordered, not depth-tested. */
const RADIUS_LAND = 1;
const RADIUS_COAST = 1.004;
export const RADIUS_SPHERE = R_SPHERE;
export const RADIUS_GRATICULE = 1.003;

/**
 * Outer shell carrying the rim light. Exported because the camera has to stay outside it: fly inside an
 * additively blended backside shell and the halo becomes a wash over the whole screen.
 */
/** Between the coastline and the markers: night dims the geography and never the data. */
export const RADIUS_NIGHT = 1.0045;
export const RADIUS_ATMOSPHERE = 1.3;

type Ring = number[][];

/** Every landmass as a polygon: one outer ring, then any holes. `objects.land` mixes Polygon and
 * MultiPolygon, and both are flattened here so nothing downstream has to care which it was. */
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
 * Longitudes made continuous around a ring, so a landmass crossing the date line stays one shape.
 *
 * Three rings hold both +180 and -180. Read literally, Eurasia teleports across the world and back, which
 * makes it self-intersecting - and earcut promises nothing about a polygon that is not simple. It emitted
 * needles a hundred and fifty degrees long fanning out across Siberia, too thin for the seam filter to catch.
 *
 * Unwrapping runs the coastline past 180 rather than jumping back, which is what the shape actually does.
 *
 * The recentring is not optional: unwrapping accumulates from wherever the ring starts, and Eurasia's
 * starts inside the Chukotka tip, which leaves the whole continent a turn west and in the next map copy.
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

/**
 * Whole turns to add so a hole sits in the frame of the outline that contains it.
 *
 * `unwrap` lands each ring in a frame decided by where that ring starts, so the frames are per ring and
 * the correction has to be too. Giving every hole the outline's shift launched the Caspian a turn east to
 * 411 degrees, and earcut bridged across the world and swept 69 triangles through everything between.
 */
function reframe(mean: number, outlineMean: number): number {
  const turns = Math.round((outlineMean - mean) / 360);
  // Not `turns * 360` unguarded: that gives negative zero for the common case, which compares unequal.
  return turns === 0 ? 0 : turns * 360;
}

/**
 * Closes a ring that wraps the world instead of closing, by walking it around the pole.
 *
 * Antarctica is one west-to-east sweep, not a loop, so its closing edge runs 358 degrees straight back at
 * latitude -84.5 and cuts through its own coastline. The shape being filled is the ring plus a cap: on to
 * the antimeridian, down to the pole, across. Three points, and the polygon is simple.
 *
 * After `unwrap`, never before. Unwrap reads the cap's deliberate 360-degree step as a seam and collapses it.
 */
function closeAtPole(ring: Ring): Ring {
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (Math.abs(last[0]! - first[0]!) <= 180) return ring;
  const pole = first[1]! < 0 ? -90 : 90;
  // Carrying on the way the ring was already travelling. Turning back folds the cap over the coast.
  const end = last[0]! > first[0]! ? 180 : -180;
  return [...ring, [end, last[1]!], [end, pole], [-end, pole]];
}

/** Whole turns to add so a ring's longitudes sit around the prime meridian rather than a turn away. */
export function recentre(mean: number): number {
  const turns = Math.round(mean / 360);
  // Not `-turns * 360`: that gives negative zero for the common case, which compares unequal.
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
 * Split every triangle into four, sharing edge midpoints. Uniform rather than adaptive: subdividing only
 * what needs it leaves a T-junction, which on a flat fill is a hairline of ocean through a continent.
 */
function subdivide(verts: number[], tris: number[]): { verts: number[]; tris: number[] } {
  const out: number[] = [];
  const cache = new Map<number, number>();

  const mid = (i: number, j: number): number => {
    const key = i < j ? i * 1e7 + j : j * 1e7 + i;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    /*
     * A plain average. Never take the short way round the date line here: `unwrap` deliberately runs a
     * coastline past 180, so folding the midpoint of 185 and 183 back to -175 tears the triangle across the
     * whole world. Safe because the seam filter guarantees every triangle here spans less than half a world.
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
   * Never recover these from the sphere position with `atan2`: `densify` emits longitudes past 180, earcut
   * triangulates happily there, and atan2 folds 180.5 back to -179.5 so a two-degree triangle spans the world.
   */
  lonLat: Float32Array;
  /** How many triangles arrived wound the wrong way. Zero would mean the source became consistent. */
  flipped: number;
  /** How many triangles were bisected for being too wide to draw. Zero would mean no ring spans 180. */
  split: number;
  /** How many were repeated across the seam. Zero would mean no ring is drawn outside its own copy. */
  wrapped: number;
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

/** Longest edge the fill may keep. See the note at the call site for how this number was chosen. */
const MAX_EDGE_DEG = 4;

/**
 * Splits long edges until none exceeds `MAX_EDGE_DEG`, without leaving T-junctions. Red-green refinement,
 * with marks on the edge rather than on the triangle, which is what makes both owners agree.
 */
function capEdges(
  verts: number[], tris: number[],
): { verts: number[]; tris: number[]; split: number } {
  const key = (i: number, j: number): number => (i < j ? i * 1e7 + j : j * 1e7 + i);
  const len = (i: number, j: number): number =>
    spanDeg(verts[i * 2]!, verts[i * 2 + 1]!, verts[j * 2]!, verts[j * 2 + 1]!);

  const marked = new Set<number>();
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    if (len(a, b) > MAX_EDGE_DEG) marked.add(key(a, b));
    if (len(b, c) > MAX_EDGE_DEG) marked.add(key(b, c));
    if (len(c, a) > MAX_EDGE_DEG) marked.add(key(c, a));
  }
  // A triangle with any marked edge also splits its longest, or refinement leaves slivers. Eight rounds is
  // a backstop against a degenerate triangle cycling forever.
  for (let round = 0; round < 8; round += 1) {
    let changed = false;
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
      const e = [key(a, b), key(b, c), key(c, a)];
      if (!e.some((k) => marked.has(k))) continue;
      const d = [len(a, b), len(b, c), len(c, a)];
      const longest = d[0]! >= d[1]! && d[0]! >= d[2]! ? 0 : d[1]! >= d[2]! ? 1 : 2;
      if (!marked.has(e[longest]!)) { marked.add(e[longest]!); changed = true; }
    }
    if (!changed) break;
  }

  const mids = new Map<number, number>();
  const mid = (i: number, j: number): number => {
    const k = key(i, j);
    const hit = mids.get(k);
    if (hit !== undefined) return hit;
    const idx = verts.length / 2;
    verts.push((verts[i * 2]! + verts[j * 2]!) / 2, (verts[i * 2 + 1]! + verts[j * 2 + 1]!) / 2);
    mids.set(k, idx);
    return idx;
  };

  const out: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    let [a, b, c] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    let [ab, bc, ca] = [marked.has(key(a, b)), marked.has(key(b, c)), marked.has(key(c, a))];
    const count = Number(ab) + Number(bc) + Number(ca);
    if (count === 0) { out.push(a, b, c); continue; }
    if (count === 3) {
      const [p, q, r] = [mid(a, b), mid(b, c), mid(c, a)];
      out.push(a, p, r, p, b, q, r, q, c, p, q, r);
      continue;
    }
    // Rotate so the cases below only handle `ab` (and `bc`) being marked. Rotating preserves the winding;
    // swapping would not.
    for (let turn = 0; turn < 3 && !(ab && (count === 1 || bc)); turn += 1) {
      [a, b, c] = [b, c, a];
      [ab, bc, ca] = [bc, ca, ab];
    }
    const p = mid(a, b);
    if (count === 1) { out.push(a, p, c, p, b, c); continue; }
    const q = mid(b, c);
    out.push(a, p, c, p, b, q, p, q, c);
  }
  return { verts, tris: out, split: marked.size };
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
    let outlineMean = 0;

    polygon.forEach((raw, ringIndex) => {
      // GeoJSON closes every ring by repeating the first point. earcut treats that as a degenerate
      // edge, so it comes off before triangulation and goes back on for the stroke.
      const un = unwrap(raw.slice(0, -1) as Ring);
      /*
       * Recentring asks where the polygon should sit; reframing asks where this ring sits relative to the
       * one containing it. A hole only ever has the second, and answering it with the first put the Caspian
       * a turn east of Eurasia.
       */
      const shift = ringIndex === 0 ? recentre(un.mean) : reframe(un.mean, outlineMean);
      if (ringIndex === 0) outlineMean = un.mean + shift;
      const moved = shift === 0 ? un.ring : un.ring.map(([lon, lat]) => [lon! + shift, lat!]);

      const sealed = closeAtPole(moved);
      const closed = densify(sealed);
      if (ringIndex > 0) holes.push(flat.length / 2);
      for (const [lon, lat] of closed) flat.push(lon!, lat!);

      // Built from the ring before the cap. The cap is triangulation, not geography: stroked, it draws a
      // line down the antimeridian where there is no coast.
      const outline = sealed === moved ? closed : densify(moved);
      for (let i = 0; i < outline.length; i += 1) {
        const a = outline[i]!;
        const b = outline[(i + 1) % outline.length]!;
        /*
         * Segments crossing the antimeridian are dropped, as the plate boundaries already drop theirs.
         * Flattened, such a segment is a line the full width of the world. The fragment-derivative trick
         * that catches spanning triangles cannot catch these: a 1px line has almost no derivative along it.
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
   * Wide triangles are split here, before anything subdivides them.
   *
   * They used to be dropped, on the reasoning that a triangle wider than half the world must be crossing the
   * date line. That was never what the filter did: Eurasia spans 207 degrees by nature and Antarctica 358, so
   * dropping them cut a chord-edged wedge through Siberia with no fill and no coastline in it.
   *
   * Keeping them is safe only because `reframe` and `closeAtPole` removed both sources of malformed output.
   * Bisect the widest edge rather than clipping against a meridian: in one continuous frame the midpoint of
   * two longitudes is their average, with no cases.
   *
   * The adaptive split leaves T-junctions, which `conform` below is what removes.
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

  // Depth is a backstop, not a budget: Antarctica's widest needs four levels and the cap is eight. It emits
  // rather than drops when it runs out, because a hole is the bug being fixed.
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

  /*
   * No edge longer than `MAX_EDGE_DEG`, and every split shared by both triangles owning the edge.
   *
   * The adaptive passes above strand a midpoint on the straight edge of an unsplit neighbour. That vertex is
   * lifted onto the sphere while the edge beside it stays a chord, so the mesh opens a lens-shaped hole and
   * the ocean shows through. Reported four times as lines across Russia and spots across China, all one
   * defect, proved by painting the ocean green and watching the scratch turn green with it.
   *
   * The gap is the sagitta of its edge, `R(1 - cos(d/2))`, so it scales with the square: 11.4 degrees is
   * about four pixels, four degrees is 0.49px. Of 956,706 edges only 6,014 were over four.
   *
   * Conforming by construction: an edge is marked once in a map keyed by its endpoints, so neither side can
   * be left with the long version.
   */
  // To a fixed point, because one pass only halves. The bound is a backstop; the loop stops as soon as a
  // pass finds nothing left to mark.
  for (let pass = 0; pass < 6; pass += 1) {
    const capped = capEdges(mesh.verts, mesh.tris);
    mesh = { verts: capped.verts, tris: capped.tris };
    if (capped.split === 0) break;
  }

  /*
   * Whole triangles are repeated across the seam, so the mesh is periodic like the map that draws it.
   *
   * `visibleCopies` assumes copy k covers a period centred on k, which is true of the ocean shell and false
   * here: `unwrap` runs Eurasia out to 190 degrees, so the land poked into the next copy's territory and
   * that copy's opaque ocean painted over it. The coastline sits in front of the ocean and survived, which
   * is why the eastern tip of Russia appeared as an outline around nothing.
   *
   * Whole triangles, never clipped: a triangle cut at the seam can tear, and a duplicate cannot.
   */
  let wrapped = 0;
  {
    // The original triangles only. Appending to the array being walked reruns the duplicates, and each one
    // is out of range at the other edge by construction, so it would qualify to be copied back.
    const original = mesh.tris.length;
    for (let t = 0; t < original; t += 3) {
      const vs = [mesh.tris[t]!, mesh.tris[t + 1]!, mesh.tris[t + 2]!];
      const lons = vs.map((v) => mesh.verts[v * 2]!);
      const turn = Math.max(...lons) > 180 ? -360 : Math.min(...lons) < -180 ? 360 : 0;
      if (turn === 0) continue;
      wrapped += 1;
      for (const v of vs) {
        mesh.tris.push(mesh.verts.length / 2);
        mesh.verts.push(mesh.verts[v * 2]! + turn, mesh.verts[v * 2 + 1]!);
      }
    }
  }

  const count = mesh.verts.length / 2;
  const position = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    const [x, y, z] = toVec3(mesh.verts[v * 2]!, mesh.verts[v * 2 + 1]!, RADIUS_LAND);
    position[v * 3] = x;
    position[v * 3 + 1] = y;
    position[v * 3 + 2] = z;
  }

  // Measured, and kept measured. This is why SUBDIVISIONS is what it is, and it depends on the longest edge
  // earcut happened to emit inside a continent. A data or densify change moves it silently otherwise.
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
   * Every triangle wound so its face points away from the centre. The fill is drawn with `depthTest: false`
   * and relies on back-face culling to hide the far hemisphere, and earcut preserves the winding of the ring
   * it is given - Natural Earth's are not all the same. 1,559 of 303,360 faced inward, which showed as
   * landmasses from the other side of the planet faintly through the ocean.
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
    wrapped,
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
