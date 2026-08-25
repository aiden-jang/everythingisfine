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
 * Three halves that to 15.6 degrees at four times the triangles. It is not raised further because
 * the sag no longer causes holes at all (see the depth note in globe/scene.ts) and only pulls the
 * fill fractionally inside its own coastline, which the stroke covers.
 */
const SUBDIVISIONS = 3;

/**
 * Widest a triangle may be, in degrees of longitude, before it is split rather than subdivided.
 *
 * Ninety rather than a hair under 180, so three uniform passes leave a split triangle's children no
 * coarser than the ones the continents already produce. It is a margin, not a measurement: a
 * 200-degree triangle drew a wash and streaks, and nothing said the threshold for that was 180.
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

/**
 * Whole turns to add so a hole sits in the frame of the outline that contains it.
 *
 * `unwrap` runs per ring and lands each one in a frame decided by wherever that ring happens to
 * start. Eurasia starts inside the Chukotka tip, so its outline unwraps a full turn west and is
 * recentred back; the Caspian starts in the Caspian and needs no correction at all. Giving both the
 * outline's shift, which is what "one shift for the whole polygon" did, launched the hole a turn east
 * to 411 degrees. earcut bridged the outline to a hole on the other side of the world and swept 69
 * triangles across everything in between, half of them narrow enough to slip the seam filter.
 *
 * The frames are per ring, so the correction has to be too. Measured against the outline's mean in
 * its final frame, not against zero.
 */
export function reframe(mean: number, outlineMean: number): number {
  const turns = Math.round((outlineMean - mean) / 360);
  // Not `turns * 360` unguarded: that gives negative zero for the common case, which is the same
  // number and a different one to anything comparing identities.
  return turns === 0 ? 0 : turns * 360;
}

/**
 * Closes a ring that wraps the world instead of closing, by walking it around the pole.
 *
 * Antarctica's coastline is not a loop. Natural Earth gives it as one west-to-east sweep from 180W to
 * 178.3E: 555 points, no interior jump in longitude, and no vertex anywhere near the pole. Read as a
 * polygon, its closing edge runs 358 degrees straight back across the world at latitude -84.5, which
 * cuts through the continent's own coastline where that dips to -85.6. So the ring self-intersects,
 * and earcut promises nothing about a polygon that is not simple.
 *
 * The shape being filled is not the ring. It is the ring plus the cap: on to the antimeridian, down
 * to the pole, across, and the closing edge climbs back up. Three points, and the polygon is simple.
 *
 * After `unwrap`, never before. Unwrap exists to make consecutive longitudes continuous, so it reads
 * the cap's deliberate 360-degree step across the pole as a seam to be removed and folds the far
 * corner onto the near one, collapsing the cap to a line.
 */
export function closeAtPole(ring: Ring): Ring {
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
 * Splits long edges until none is longer than `MAX_EDGE_DEG`, without leaving T-junctions.
 *
 * Red-green refinement: mark the edges that are too long, close the marking so no triangle is left with
 * an awkward split, then rebuild each triangle from the pattern of its marked edges. Marks live on the
 * edge rather than on the triangle, which is what makes both owners agree.
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
  // Closure, capped: a triangle with any marked edge also splits its longest, or refinement leaves
  // slivers. Eight rounds is a backstop against a degenerate triangle cycling forever.
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
    // Rotate so the cases below only have to handle `ab` (and `bc`) being the marked ones. Winding is
    // preserved by rotating rather than swapping.
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
       * The outline is recentred; every hole is then reframed onto the outline.
       *
       * Two different questions that look like one. Recentring asks where the polygon should sit;
       * reframing asks where this ring sits relative to the one that contains it, and a hole only
       * ever has the second. Answering the second with the first is what put the Caspian a turn east
       * of Eurasia. A hole belongs to an outline: same frame, measured against it.
       */
      const shift = ringIndex === 0 ? recentre(un.mean) : reframe(un.mean, outlineMean);
      if (ringIndex === 0) outlineMean = un.mean + shift;
      const moved = shift === 0 ? un.ring : un.ring.map(([lon, lat]) => [lon! + shift, lat!]);

      const sealed = closeAtPole(moved);
      const closed = densify(sealed);
      if (ringIndex > 0) holes.push(flat.length / 2);
      for (const [lon, lat] of closed) flat.push(lon!, lat!);

      /*
       * The stroke follows the coastline, so it is built from the ring before the cap.
       *
       * The cap is triangulation, not geography. Stroked, it draws a 1px line down the antimeridian
       * and along the bottom of the map, which is a border where there is no coast.
       */
      const outline = sealed === moved ? closed : densify(moved);
      for (let i = 0; i < outline.length; i += 1) {
        const a = outline[i]!;
        const b = outline[(i + 1) % outline.length]!;
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
   * half the world must be crossing the date line and nothing else is. That was never what the filter
   * was doing. It was deleting malformed output, and it took real geography with it: Eurasia spans 207
   * degrees by nature and Antarctica 358, so both fill honest interior with wide triangles, and losing
   * those cut a chord-edged wedge through Siberia with no fill and no coastline inside it.
   *
   * It is safe to keep them only because the two sources of malformed output are gone. `reframe` puts
   * every hole in its outline's frame, which took Eurasia from 69 triangles outside its own outline to
   * none, and `closeAtPole` makes Antarctica's ring simple. Both were measured that way, by testing
   * triangle centroids against the ring they came from, and the seam filter was hiding only about half
   * of what they emitted: the narrow half was already on screen.
   *
   * Keeping them as they came is still wrong, because a 200-degree triangle draws a wash and streaks
   * across Asia. Bisect the widest edge until nothing is wide, rather than clipping against a
   * meridian: in one continuous frame the midpoint of two longitudes is their average, no cases.
   *
   * The split is adaptive, which leaves a T-junction where a split triangle meets an unsplit
   * neighbour, and the note on `subdivide` is right that those show as hairlines on a flat fill. Not
   * here: every vertex this introduces sits on the straight line between two existing ones, in the
   * frame the map is drawn in, so on the map the two sides coincide exactly. On the globe they differ
   * by the sagitta of an edge already an order finer than `maxPullIn`.
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
   * Depth is a backstop, not a budget. Antarctica's widest needs four levels to clear 90 and the cap
   * is eight; it is here so a degenerate triangle cannot recurse forever, and it emits rather than
   * drops when it runs out, because a hole is the bug being fixed.
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

  /*
   * No edge longer than `MAX_EDGE_DEG`, and every split shared by both triangles that own the edge.
   *
   * The passes above split adaptively, which leaves a midpoint stranded on the straight edge of an
   * unsplit neighbour. The note on the bisection argues that is harmless because the two sides differ
   * only by a sagitta - true, and the sagitta is the whole problem. A stranded vertex is lifted onto
   * the sphere while the edge beside it stays a chord in screen space, so the mesh opens a lens-shaped
   * hole and the ocean shows through it. Reported four times, as lines across Russia, spots across
   * China, a gap against Mongolia, and finally a scratch line: all one defect, proved by painting the
   * ocean green and watching the scratch turn green with it.
   *
   * Measured, which is what makes the threshold a number rather than a guess. The gap is the sagitta of
   * its edge, `R(1 - cos(d/2))`: 11.4 degrees was 0.005R, about four pixels on this globe, and it scales
   * with the square of the edge. At four degrees it is 0.49px and at three, 0.27px. Of 956,706 edges only
   * 6,014 were over four degrees and none over twelve, so the cap costs a few per cent of the mesh.
   *
   * Conforming by construction: an edge is marked once, in a map keyed by its two endpoints, and every
   * triangle that owns a marked edge is rebuilt around it. Neither side can be left with the long
   * version. The second rule - a triangle with any marked edge also marks its longest - stops the
   * refinement leaving slivers behind.
   */
  /*
   * To a fixed point, because one pass only halves. The longest edge starts at 11.4 degrees, so the
   * first pass leaves 5.7 and the second 2.85; the bound is a backstop against a degenerate triangle,
   * and the loop stops as soon as a pass finds nothing left to mark.
   */
  for (let pass = 0; pass < 6; pass += 1) {
    const capped = capEdges(mesh.verts, mesh.tris);
    mesh = { verts: capped.verts, tris: capped.tris };
    if (capped.split === 0) break;
  }

  /*
   * Whole triangles are repeated across the seam, so the mesh is periodic like the map that draws it.
   *
   * The flat map repeats by rendering the world again beside itself, one pass per copy, each pass
   * painting over the last. `visibleCopies` says copy k covers a period centred on k and that those
   * tile the line exactly, which is true of the ocean shell and false of this mesh: `unwrap` runs
   * Eurasia out to 190 degrees so Chukotka stays attached, so the land poked ten degrees into the next
   * copy's territory and that copy's opaque ocean painted over it on the following pass. The coastline
   * survived, sitting at `RADIUS_COAST` in front of the ocean, which is why the eastern tip of Russia
   * appeared as an outline around nothing.
   *
   * The tip is missing rather than misplaced: the mesh holds it only at +180, never at -180 where the
   * neighbouring copy looks for it. Repeating the triangle at both is what makes the two agree.
   *
   * Whole triangles, never clipped, for the reason the copies exist at all: a triangle cut at the seam
   * is a triangle that can tear. A duplicate is internally consistent, and on the globe it lands on
   * exactly the sphere position it came from, where a flat fill hides it completely.
   */
  let wrapped = 0;
  {
    // The original triangles only. Appending to the array being walked reruns the duplicates, and a
    // duplicate is out of range at the other edge by construction, so it qualifies to be copied back.
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
