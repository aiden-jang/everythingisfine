import { BufferAttribute } from "three";
import type { BufferGeometry, Material, Vector3, WebGLProgramParametersWithUniforms } from "three";
import { DEG } from "../geo/sphere";

/* Globe to map, as one geometry. See ARCHITECTURE.md#srcglobemorphts. */

/** Half-width of the map, in the same units as the globe's radius. Equirectangular is 2:1. */
export const MAP_HALF_WIDTH = 2;

/** How much of a layer's radial lift survives on the flat map. See ARCHITECTURE.md#srcglobemorphts. */
const MAP_LAYER_LIFT = 0.2;
const ARC_SCALE = MAP_HALF_WIDTH / Math.PI;
const REPEAT_START = 0.8;

export const projectionMoving = (t: number): boolean => t > 0 && t < 1;

export function mapRepeatSpacing(t: number): number {
  if (t < REPEAT_START) return 0;
  const remaining = (1 - t) / (1 - REPEAT_START);
  return 2 * MAP_HALF_WIDTH + 8 * remaining * remaining;
}

/** The CPU form of the sheet projection, for the camera and geographic overlays. */
export function unfoldPoint(
  out: Vector3,
  lon: number,
  lat: number,
  t: number,
  depth = 0,
  normal?: Vector3,
): Vector3 {
  const lam = lon * DEG;
  const phi = lat * DEG;
  const curl = 1 - t;
  const theta = curl * lam;
  const sine = Math.sin(phi);
  const cosine = Math.cos(phi);
  const width = curl * cosine + t * ARC_SCALE;
  const vertical = curl * sine + t * (lat / 90);
  if (curl === 0) {
    normal?.set(0, 0, 1);
    return out.set(lam * ARC_SCALE, vertical, depth);
  }
  out.set(
    width * (Math.sin(theta) / curl),
    vertical,
    curl * cosine - width * ((2 * Math.sin(theta / 2) ** 2) / curl),
  );
  if (depth !== 0 || normal) {
    const nx = width * Math.sin(theta);
    const ny = sine * (1 - t * Math.cos(theta));
    const nz = width * Math.cos(theta);
    const scale = 1 / Math.hypot(nx, ny, nz);
    normal?.set(nx * scale, ny * scale, nz * scale);
    out.x += nx * scale * depth;
    out.y += ny * scale * depth;
    out.z += nz * scale * depth;
  }
  return out;
}

/**
 * Where a sphere shell starts its first column, so u = 0 lands on 180 degrees west. Cutting the seam column
 * out instead left a bright slit down the antimeridian with the atmosphere glowing through it. Rotating the
 * seam keeps every triangle and makes the texture coordinate a usable longitude.
 */
export const SPHERE_PHI_START = -Math.PI / 2;

export const MORPH_GLSL = /* glsl */ `
  uniform float uMorph;
  attribute vec2 aLonLat;

  vec3 fmNormal(vec3 sphere) {
    if (uMorph <= 0.0) return normalize(sphere);
    if (uMorph >= 1.0) return vec3(0.0, 0.0, 1.0);
    float r = length(sphere);
    float theta = radians(aLonLat.x) * (1.0 - uMorph);
    float width = mix(length(sphere.xz) / r, ${ARC_SCALE}, uMorph);
    return normalize(vec3(
      width * sin(theta),
      sphere.y / r * (1.0 - uMorph * cos(theta)),
      width * cos(theta)
    ));
  }

  vec3 fmProject(vec3 sphere) {
    if (uMorph <= 0.0) return sphere;
    // Keep the stored seam longitude, including the two separate edges at plus and minus 180.
    float r = length(sphere);
    float longitude = radians(aLonLat.x);
    float lift = (r - 1.0) * mix(1.0, ${MAP_LAYER_LIFT.toFixed(1)}, uMorph);
    if (uMorph >= 1.0) return vec3(longitude * ${ARC_SCALE}, aLonLat.y / 90.0, lift);
    float curl = 1.0 - uMorph;
    float theta = curl * longitude;
    float cosine = length(sphere.xz) / r;
    float width = mix(cosine, ${ARC_SCALE}, uMorph);
    // Half-angle form stays continuous as the arc approaches a plane.
    float halfSine = sin(theta * 0.5);
    vec3 sheet = vec3(
      width * (sin(theta) / curl),
      mix(sphere.y / r, aLonLat.y / 90.0, uMorph),
      curl * cosine - width * ((2.0 * halfSine * halfSine) / curl)
    );
    return sheet + fmNormal(sphere) * lift;
  }
`;

/**
 * Which copies of the map intersect the view, as inclusive integer offsets. Two most of the time, one when
 * zoomed in, three when the whole world plus both edges is on screen. See ARCHITECTURE.md#srcglobemorphts.
 */
export function visibleCopies(
  cameraX: number,
  halfWidth: number,
  period = 2 * MAP_HALF_WIDTH,
): { first: number; last: number } {
  /*
   * Which copy a point falls in, not how many periods away it is. Copy k covers a period centred on k and
   * those tile the line exactly, so it is the nearest multiple. Floor and ceil add a copy at each end that
   * is entirely off screen: correct, and a wasted pass over three hundred thousand triangles every frame.
   */
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
