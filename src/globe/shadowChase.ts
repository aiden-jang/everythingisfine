import { Mesh, ShaderMaterial, SphereGeometry, Vector2, Vector3 } from "three";
import { eclipseElements, eclipseSlopes } from "../geo/eclipse2027";
import { toVec3 } from "../geo/sphere";
import { attachLonLat, MORPH_GLSL, SPHERE_PHI_START } from "./morph";
import type { GeoPoint } from "../app/observations/types";

export function createShadowChase(morph: { value: number }) {
  const uniforms = {
    uMorph: morph,
    axis: { value: new Vector3() },
    east: { value: new Vector3() },
    north: { value: new Vector3() },
    intercept: { value: new Vector2() },
    radii: { value: new Vector2() },
    centre: { value: new Vector3() },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${MORPH_GLSL}
      varying vec3 surface;
      varying vec2 geo;
      void main() {
        surface = position;
        geo = aLonLat;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(fmProject(position), 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 surface;
      varying vec2 geo;
      uniform float uMorph;
      uniform vec3 axis, east, north, centre;
      uniform vec2 intercept, radii;
      void main() {
        vec3 p = normalize(surface);
        if (uMorph > 0.0) {
          vec2 at = radians(geo);
          float latitude = cos(at.y);
          vec3 fromMap = vec3(latitude * sin(at.x), sin(at.y), latitude * cos(at.x));
          p = normalize(mix(p, fromMap, uMorph));
        }
        float sunlight = dot(p, axis);
        if (sunlight < 0.0) discard;

        // Project the WGS84 observer into the fundamental plane perpendicular to the shadow axis.
        const float polarSquared = 0.99330562;
        vec3 observer = p * vec3(1.0, polarSquared, 1.0)
          * inversesqrt(1.0 - (1.0 - polarSquared) * p.y * p.y);
        float z = dot(observer, axis);
        float separation = length(intercept - vec2(dot(observer, east), dot(observer, north)));
        float outer = radii.x - z * ${eclipseSlopes[0]};
        float inner = -radii.y + z * ${eclipseSlopes[1]};
        float partial = 1.0 - smoothstep(inner, outer, separation);
        float total = 1.0 - smoothstep(inner - 0.002, inner + 0.002, separation);

        float distance = length(p - centre);
        float edge = max(fwidth(distance), 0.001);
        float locator = 1.0 - smoothstep(edge * 0.5, edge * 1.9, abs(distance - 0.037));
        float shadow = max(0.79 * partial * partial, total * 0.99);
        gl_FragColor = vec4(mix(vec3(0.002, 0.004, 0.013), vec3(0.82, 0.66, 0.43), locator),
          max(shadow * smoothstep(0.0, 0.04, sunlight), locator * 0.95));
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new SphereGeometry(1.0065, 96, 64, SPHERE_PHI_START);
  attachLonLat(geometry);
  const object = new Mesh(geometry, material);
  object.renderOrder = 4.75;
  object.frustumCulled = false;
  return {
    object,
    set(at: number, point: GeoPoint) {
      const { x, y, declination, hourAngle, l1, l2 } = eclipseElements(at);
      const h = -hourAngle;
      uniforms.axis.value.set(
        Math.cos(declination) * Math.sin(h),
        Math.sin(declination),
        Math.cos(declination) * Math.cos(h),
      );
      uniforms.east.value.set(Math.cos(h), 0, -Math.sin(h));
      uniforms.north.value.crossVectors(uniforms.axis.value, uniforms.east.value);
      uniforms.intercept.value.set(x, y);
      uniforms.radii.value.set(l1, l2);
      uniforms.centre.value.set(...toVec3(point.lon, point.lat, 1));
    },
    dispose() {
      object.geometry.dispose();
      material.dispose();
    },
  };
}
