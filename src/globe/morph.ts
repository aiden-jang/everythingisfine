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
 * Removes the triangles that would stretch across the map, in place.
 *
 * `SphereGeometry` duplicates its seam vertices at the same position, and `atan2` returns +pi for one
 * copy and -pi for the other, so the quad between them spans the whole world once flattened. The pole
 * fans do the same: every vertex sits at the same latitude and a different longitude.
 *
 * Slivers along the date line and two points at the poles, on a globe. A band across the map, flat.
 */
export function dropSeamTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!index) return 0;

  const lon = new Float32Array(position.count);
  for (let v = 0; v < position.count; v += 1) {
    lon[v] = Math.atan2(position.getX(v), position.getZ(v));
  }

  const kept: number[] = [];
  let dropped = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = lon[index.getX(i)]!;
    const b = lon[index.getX(i + 1)]!;
    const c = lon[index.getX(i + 2)]!;
    if (Math.max(a, b, c) - Math.min(a, b, c) > Math.PI) {
      dropped += 1;
      continue;
    }
    kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  geometry.setIndex(kept);
  return dropped;
}

/**
 * Derives `aLonLat` for a geometry that was generated rather than built from coordinates.
 *
 * The sphere shells are the only layers with no source longitude to carry, and they are also the only
 * ones where deriving it is safe: a `SphereGeometry` has no edge that wraps the date line once its seam
 * column is gone, and its pole rows are gone too.
 */
export function attachLonLat(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const out = new Float32Array(position.count * 2);

  for (let v = 0; v < position.count; v += 1) {
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    const r = Math.hypot(x, y, z) || 1;
    /*
     * At a pole the position knows the latitude and not the longitude, and the texture coordinate
     * knows both.
     *
     * `SphereGeometry` gives its pole rows a vertex per column, all at the same point, distinguished
     * only by `u`. `atan2(0, 0)` returns zero for every one of them, so on the map the whole polar fan
     * collapses onto the prime meridian and draws exactly the streak this attribute exists to prevent.
     * The seam filter cannot see it either: those triangles all report a longitude span of zero.
     */
    const atPole = Math.abs(y) > 0.99999 * r;
    out[v * 2] = atPole && uv
      ? (uv.getX(v) - 0.5) * 360
      : (Math.atan2(x, z) * 180) / Math.PI;
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
