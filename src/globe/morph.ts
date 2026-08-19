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
      (r - 1.0) * 8.0
    );
    return mix(sphere, plane, uMorph);
  }
`;

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
