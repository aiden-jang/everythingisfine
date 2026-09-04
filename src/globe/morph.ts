import { BufferAttribute } from "three";
import type { BufferGeometry, Material, WebGLProgramParametersWithUniforms } from "three";

/* Globe to map, as one geometry. See ARCHITECTURE.md#srcglobemorphts. */

/** Half-width of the map, in the same units as the globe's radius. Equirectangular is 2:1. */
export const MAP_HALF_WIDTH = 2;

/** How much of a layer's radial lift survives on the flat map. See ARCHITECTURE.md#srcglobemorphts. */
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
    /* The plane comes from the attribute, never from the position. Never recover longitude with atan2.
       Densifying emits longitudes past 180 and earcut triangulates there, so atan2 folds 180.5 to -179.5
       and a two-degree triangle spans the world. See ARCHITECTURE.md#srcglobemorphts. */
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
 * zoomed in, three when the whole world plus both edges is on screen. See ARCHITECTURE.md#srcglobemorphts.
 */
export function visibleCopies(cameraX: number, halfWidth: number): { first: number; last: number } {
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
 * Derives `aLonLat` for a sphere shell from its texture coordinates, not its positions. See
 * ARCHITECTURE.md.
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

  /* The pole fans collapse, so the map gets a straight edge. See ARCHITECTURE.md#srcglobemorphts. */
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
