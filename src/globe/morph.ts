import { BufferAttribute } from "three";
import type { BufferGeometry, Material, WebGLProgramParametersWithUniforms } from "three";

/*
 * Globe to map, as one geometry.
 *
 * The obvious build is two scenes: sphere positions in one, equirectangular positions in the other,
 * cross-faded. It doubles every buffer, it doubles every place a layer can be forgotten, and the
 * switch is a dissolve, which says nothing. A planet unwrapping into a map says what a projection
 * *is*, which is the one thing a flat map of earthquakes needs its viewer to understand: Greenland is
 * not that big and the poles are a lie.
 *
 * So there is one set of positions, on the sphere, and the plane is derived from them in the vertex
 * shader. Recovering longitude and latitude from a point costs an `asin` and an `atan` per vertex,
 * which a GPU does not notice and which saves carrying a second copy of every buffer for a view that
 * is off most of the time.
 */

/** Half-width of the map, in the same units as the globe's radius. Equirectangular is 2:1. */
export const MAP_HALF_WIDTH = 2;

/**
 * How much of a layer's radial lift survives on the flat map.
 *
 * On the globe the lifts are radial, so a layer stays over the piece of ground it belongs to however
 * the camera moves. Flattened they become a shift straight at the camera, and a perspective camera
 * magnifies whatever is nearer: the coastline sat 0.032 units in front of the fill and was drawn about
 * one percent larger than it, so it crept outward from its own shoreline, by nothing at the centre of
 * the frame and by seven pixels at the edge at zoom 2. Measured, and it doubled with zoom, which is
 * the signature of parallax rather than of geometry.
 *
 * The markers were worse, sitting further out again at 0.048, while `project` places their hover ring
 * and tooltip at zero. On a seismic map the dots being off the coast they belong to is the one error
 * that matters.
 *
 * So the lift shrinks to the least that still orders the layers. It is only ever asked to keep the
 * line layers off the ocean plane, and 0.0002 between neighbours is a few hundred depth-buffer steps
 * at these distances, while leaving the worst-case drift under half a pixel. The 8 it replaces had no
 * note attached and nothing needed it.
 */
const MAP_LAYER_LIFT = 0.2;

/**
 * Where a sphere shell starts its first column, so that u = 0 lands on 180 degrees west.
 *
 * Cutting the seam column out of the shells was the first answer, and it left a bright slit down the
 * antimeridian on the globe: a gap in the ocean with the atmosphere glowing through it. Rotating the
 * seam instead keeps every triangle and makes the texture coordinate a usable longitude, which the
 * flat map needs and the globe never cared about.
 */
export const SPHERE_PHI_START = -Math.PI / 2;

export const MORPH_GLSL = /* glsl */ `
  uniform float uMorph;
  attribute vec2 aLonLat;

  vec3 fmProject(vec3 sphere) {
    /*
     * The plane comes from the attribute, not from the position.
     *
     * Recovering longitude with atan2 looks equivalent and is not, in a way that only appears once
     * something interpolates between two vertices. Densifying walks the shorter way round the date
     * line and emits longitudes past 180; earcut triangulates in that space quite happily; atan2 then
     * folds 180.5 back to -179.5 and a triangle two degrees wide is drawn spanning the world. At a
     * pole it is worse: longitude does not exist there, atan2(0, 0) returns zero, and every meridian
     * ending at one is dragged onto the prime meridian.
     *
     * Both are the same mistake: deriving a quantity that was already known and had been thrown away.
     *
     * (No backticks in here. This is inside a template literal and one of them ends the shader.)
     */
    float r = length(sphere);
    vec3 plane = vec3(
      aLonLat.x / 180.0 * ${MAP_HALF_WIDTH.toFixed(1)},
      aLonLat.y / 90.0,
      (r - 1.0) * ${MAP_LAYER_LIFT.toFixed(1)}
    );
    return mix(sphere, plane, uMorph);
  }
`;

/**
 * Which copies of the map intersect the view, as inclusive integer offsets.
 *
 * The flat map repeats, and it repeats by being drawn again rather than by wrapping vertices, so this
 * decides how many passes a frame costs. Two most of the time, one when zoomed in far enough that no
 * neighbour reaches the screen, three only when the whole world plus both edges is on screen.
 *
 * Extracted because it is the part that fails quietly: an off-by-one leaves a strip of void at one
 * edge that looks like the end of the world rather than a missing draw call.
 */
export function visibleCopies(
  cameraX: number, halfWidth: number,
): { first: number; last: number } {
  /*
   * Which copy a point falls in, not how many periods away it is.
   *
   * Copy k covers [k * period - MAP_HALF_WIDTH, k * period + MAP_HALF_WIDTH], and those tile the line
   * exactly, so the copy containing a point is the nearest multiple. Reaching for floor and ceil
   * instead adds a copy at each end that is entirely off screen: correct, and a wasted pass over three
   * hundred thousand triangles every frame.
   */
  const period = 2 * MAP_HALF_WIDTH;
  return {
    first: Math.round((cameraX - halfWidth) / period),
    last: Math.round((cameraX + halfWidth) / period),
  };
}

/**
 * Derives `aLonLat` for a sphere shell, from its texture coordinates rather than its positions.
 *
 * The shells are the only layers with no source coordinates to carry, and `atan2` fails them twice:
 * the duplicated seam column reports -180 for one copy and +180 for the other, so the quad between
 * them spans the world, and the pole rows have no longitude at all.
 *
 * The texture coordinate knows both. It runs 0 to 1 across the full turn, including a distinct value
 * for each copy of the seam and for each column of the pole fan, which is exactly the information the
 * position threw away. It only lines up with longitude because the shells are built with the seam
 * rotated to the antimeridian; see `SPHERE_PHI_START`.
 */
export function attachLonLat(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const out = new Float32Array(position.count * 2);

  for (let v = 0; v < position.count; v += 1) {
    const y = position.getY(v);
    const r = Math.hypot(position.getX(v), y, position.getZ(v)) || 1;
    out[v * 2] = (uv.getX(v) - 0.5) * 360;
    out[v * 2 + 1] = (Math.asin(y / r) * 180) / Math.PI;
  }

  /*
   * The pole fans collapse, so the map gets a straight edge.
   *
   * A sphere ends in a fan of triangles meeting at a point, and a fan cannot tile a straight line:
   * flattened, each apex sits at its own column's longitude and the gap between neighbouring apexes
   * is a notch. Ninety-six of them along the top and bottom is a dashed line where the map should
   * simply stop, and repeating the map put two of those edges next to each other.
   *
   * Pulling every apex back to the latitude of the ring below it makes each of those triangles
   * zero-height on the map and leaves the shell ending in a line. The globe is untouched: this is an
   * attribute the plane reads and the sphere position ignores. The cost is the last degree and a half
   * of ocean tint at each pole, under the ice, where the land fill is drawn on top anyway.
   */
  let ring = 0;
  for (let v = 0; v < position.count; v += 1) {
    const lat = Math.abs(out[v * 2 + 1]!);
    if (lat < 89.999 && lat > ring) ring = lat;
  }
  for (let v = 0; v < position.count; v += 1) {
    const lat = out[v * 2 + 1]!;
    if (Math.abs(lat) > ring) out[v * 2 + 1] = Math.sign(lat) * ring;
  }

  geometry.setAttribute("aLonLat", new BufferAttribute(out, 2));
}

/**
 * Teaches a stock three.js material the morph, without rewriting it as a custom shader.
 *
 * The geography layers are `MeshBasicMaterial` and `LineBasicMaterial` and want nothing else those
 * classes do not already give them. Replacing them with hand-written shaders to add one line of
 * vertex maths would be four more shaders to keep in step with each other.
 */
export function morphable(material: Material, morph: { value: number }): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    shader.uniforms["uMorph"] = morph;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${MORPH_GLSL}\nvoid main() {`)
      .replace("#include <begin_vertex>", "vec3 transformed = fmProject(position);");

  };
  // Materials are cached by program key, and two materials that differ only in an injected shader
  // hash to the same key. Without this the second one silently reuses the first one's program.
  material.customProgramCacheKey = (): string => "fm-morph";
}
