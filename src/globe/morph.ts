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

  vec3 fmProject(vec3 sphere) {
    float r = length(sphere);
    float lat = asin(clamp(sphere.y / r, -1.0, 1.0));
    float lon = atan(sphere.x, sphere.z);
    /*
     * The radius above the unit sphere becomes depth away from the plane, exaggerated, because the
     * layers are separated by a thousandth of a radius and that is invisible once flattened. Order
     * is mostly carried by renderOrder; this keeps the two agreeing rather than fighting.
     */
    vec3 plane = vec3(lon / 3.14159265 * ${MAP_HALF_WIDTH.toFixed(1)}, lat / 1.57079633, (r - 1.0) * 8.0);
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
