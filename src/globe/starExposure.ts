import { Matrix4, Vector2, Vector3, type PerspectiveCamera } from "three";

// A short photographic exposure follows camera travel; catalogue positions and sidereal time stay intact.
export function createStarExposure() {
  const uniforms = {
    uPreviousSky: { value: new Matrix4() },
    uPreviousEye: { value: new Vector3() },
    uViewport: { value: new Vector2(1, 1) },
    uExposure: { value: 0 },
  };
  const previous = new Matrix4(),
    eye = new Vector3();
  let last = 0,
    oldWidth = 0,
    oldHeight = 0;
  return {
    uniforms,
    prepare(
      camera: PerspectiveCamera,
      width: number,
      height: number,
      reduced: boolean,
      now = performance.now(),
    ): void {
      const dt = (now - last) / 1000;
      const valid = last > 0 && dt > 0.001 && dt < 0.2 && oldWidth === width && oldHeight === height;
      uniforms.uPreviousSky.value.copy(previous);
      uniforms.uPreviousEye.value.copy(eye);
      uniforms.uViewport.value.set(width, height);
      uniforms.uExposure.value = valid && !reduced ? Math.min(8, 0.09 / dt) : 0;
      previous.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      eye.copy(camera.position);
      last = now;
      oldWidth = width;
      oldHeight = height;
    },
  };
}

export const EXPOSURE_VERTEX = /* glsl */ `
  uniform mat4 uPreviousSky;
  uniform vec3 uPreviousEye;
  uniform vec2 uViewport;
  uniform float uExposure;
  varying vec2 vTrailDirection;
  varying float vTrailLength;
  varying float vPointSize;
  varying float vCoreSize;
`;

export const EXPOSE_STAR = /* glsl */ `
  vCoreSize = gl_PointSize;
  vec4 previous = uPreviousSky * vec4(skyPoint(position) - cameraPosition + uPreviousEye, 1.0);
  vec2 travel = vec2(0.0);
  if (previous.w > 0.0 && gl_Position.w > 0.0 && uExposure > 0.0) {
    travel = (gl_Position.xy / gl_Position.w - previous.xy / previous.w) * uViewport * 0.5 * uExposure;
    travel *= smoothstep(0.35, 0.85, aBright);
  }
  float extent = length(travel);
  vTrailDirection = extent > 0.001 ? travel / extent : vec2(1.0, 0.0);
  vTrailLength = max(0.0, min(extent, 22.0 * uPixelRatio) - 0.5);
  gl_Position.xy -= vTrailDirection * vTrailLength / uViewport * gl_Position.w;
  gl_PointSize += vTrailLength;
  vPointSize = gl_PointSize;
`;

export const EXPOSURE_FRAGMENT = /* glsl */ `
  varying vec2 vTrailDirection;
  varying float vTrailLength;
  varying float vPointSize;
  varying float vCoreSize;
`;

export const EXPOSE_DISC = /* glsl */ `
  vec2 point = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * vPointSize;
  float along = dot(point, vTrailDirection);
  float across = dot(point, vec2(-vTrailDirection.y, vTrailDirection.x));
  float closest = clamp(along, -vTrailLength * 0.5, vTrailLength * 0.5);
  float d = length(vec2(along - closest, across)) / vCoreSize;
  if (d > 0.5) discard;
  float disc = smoothstep(0.5, 0.34, d);
  if (vTrailLength > 0.01) disc *= mix(0.08, 1.0,
    smoothstep(-vTrailLength * 0.5 - vCoreSize * 0.5, vTrailLength * 0.5, along));
`;
