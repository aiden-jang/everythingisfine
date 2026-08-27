import { BufferAttribute } from "three";
import type { BufferGeometry, Material, WebGLProgramParametersWithUniforms } from "three";

/*
 * Globe to map, as one geometry.
 *
 * Two scenes cross-faded doubles every buffer, doubles every place a layer can be forgotten, and the switch
 * is a dissolve, which says nothing. A planet unwrapping says what a projection is, which is the thing a
 * flat map of earthquakes needs its viewer to understand.
 *
 * So there is one set of positions, on the sphere, and the plane is derived from them in the vertex shader.
 */

/** Half-width of the map, in the same units as the globe's radius. Equirectangular is 2:1. */
export const MAP_HALF_WIDTH = 2;

/**
 * How much of a layer's radial lift survives on the flat map.
 *
 * Flattened, a radial lift becomes a shift straight at the camera, and a perspective camera magnifies
 * whatever is nearer: at 0.032 the coastline drew one percent larger than the fill and crept seven pixels
 * outward at the edge of the frame at zoom 2. It doubled with zoom, which is the signature of parallax.
 *
 * The markers were worse at 0.048, while `project` places their hover ring at zero.
 *
 * So the lift shrinks to the least that still orders the layers: 0.0002 between neighbours is a few hundred
 * depth-buffer steps at these distances, and leaves the worst-case drift under half a pixel.
 */
const MAP_LAYER_LIFT = 0.2;

/**
 * Where a sphere shell starts its first column, so u = 0 lands on 180 degrees west. Cutting the seam column
 * out instead left a bright slit down the antimeridian with the atmosphere glowing through it. Rotating the
 * seam keeps every triangle and makes the texture coordinate a usable longitude.
 */
export const SPHERE_PHI_START = -Math.PI / 2;

export const MORPH_GLSL = /* glsl */ `
  uniform float uMorph;
  attribute vec2 aLonLat;

  vec3 fmProject(vec3 sphere) {
    /*
     * The plane comes from the attribute, not from the position.
     *
     * Never recover longitude with atan2. Densifying emits longitudes past 180 and earcut triangulates in
     * that space, so atan2 folds 180.5 back to -179.5 and a two-degree triangle is drawn spanning the world.
     * At a pole longitude does not exist, atan2(0, 0) returns zero, and every meridian is dragged onto the
     * prime meridian.
     *
     * (No backticks in here. One of them ends the template literal.)
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
 * Which copies of the map intersect the view, as inclusive integer offsets. Two most of the time, one when
 * zoomed in, three when the whole world plus both edges is on screen.
 *
 * Extracted because it is the part that fails quietly: an off-by-one leaves a strip of void at one edge that
 * looks like the end of the world rather than a missing draw call.
 */
export function visibleCopies(
  cameraX: number, halfWidth: number,
): { first: number; last: number } {
  /*
   * Which copy a point falls in, not how many periods away it is. Copy k covers a period centred on k and
   * those tile the line exactly, so it is the nearest multiple. Floor and ceil add a copy at each end that
   * is entirely off screen: correct, and a wasted pass over three hundred thousand triangles every frame.
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
 * The shells have no source coordinates to carry, and `atan2` fails them twice: the duplicated seam column
 * reports -180 for one copy and +180 for the other, and the pole rows have no longitude at all.
 *
 * The texture coordinate knows both, and only lines up with longitude because the shells are built with the
 * seam rotated to the antimeridian. See `SPHERE_PHI_START`.
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
   * The pole fans collapse, so the map gets a straight edge. A fan cannot tile a straight line: flattened,
   * each apex sits at its own column's longitude and the gap between neighbours is a notch, so ninety-six of
   * them make a dashed line where the map should simply stop.
   *
   * Pulling each apex back to the ring below makes those triangles zero-height on the map. The globe is
   * untouched: this is an attribute the plane reads and the sphere position ignores.
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
 * Teaches a stock three.js material the morph, without rewriting it as a custom shader. The geography layers
 * are `MeshBasicMaterial` and `LineBasicMaterial` and want nothing else; hand-written replacements would be
 * four more shaders to keep in step.
 */
export function morphable(material: Material, morph: { value: number }): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    shader.uniforms["uMorph"] = morph;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${MORPH_GLSL}\nvoid main() {`)
      .replace("#include <begin_vertex>", "vec3 transformed = fmProject(position);");

  };
  // Materials are cached by program key, and two that differ only in an injected shader hash to the same
  // key. Without this the second silently reuses the first one's program.
  material.customProgramCacheKey = (): string => "fm-morph";
}
