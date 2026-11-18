import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineSegments,
  Mesh,
  ShaderMaterial,
} from "three";
import type { ObservationFault, ObservationView } from "../app/observations/types";
import { EARTH_RADIUS_KM, toVec3 } from "../geo/sphere";
import { MORPH_GLSL } from "./morph";

function faultGeometry(fault: ObservationFault, lines: boolean) {
  const position: number[] = [];
  const coordinates: number[] = [];
  const depths: number[] = [];
  const timing: number[] = [];
  const colors: number[] = [];
  const color = new Color();
  function push(point: ObservationFault["guides"][number], start: number, rise: number) {
    position.push(...toVec3(point.lon, point.lat, 1.012));
    coordinates.push(point.lon, point.lat);
    depths.push((point.depth * fault.exaggeration) / EARTH_RADIUS_KM);
    timing.push(start, rise);
    colors.push(color.r, color.g, color.b);
  }
  for (const { corners, start, rise, tint } of fault.patches) {
    color.setHex(tint);
    for (const i of lines ? [0, 1, 1, 2, 2, 3, 3, 0] : [0, 1, 2, 0, 2, 3]) push(corners[i]!, start, rise);
  }
  if (lines) {
    color.setHex(0x9cb5c0);
    for (const point of fault.guides) push(point, -1, 0);
  }
  return new BufferGeometry()
    .setAttribute("position", new BufferAttribute(new Float32Array(position), 3))
    .setAttribute("aLonLat", new BufferAttribute(new Float32Array(coordinates), 2))
    .setAttribute("aDepth", new BufferAttribute(new Float32Array(depths), 1))
    .setAttribute("aTiming", new BufferAttribute(new Float32Array(timing), 2))
    .setAttribute("aTint", new BufferAttribute(new Float32Array(colors), 3));
}

export function createObservationFault(morph: { value: number }) {
  const object = new Group();
  const seconds = { value: 0 };
  const amount = { value: 0 };
  function material(outline: boolean) {
    return new ShaderMaterial({
      uniforms: { uMorph: morph, seconds, amount, outline: { value: outline } },
      vertexShader: `${MORPH_GLSL}
        attribute float aDepth;
        attribute vec2 aTiming;
        attribute vec3 aTint;
        uniform float amount;
        uniform float seconds;
        varying vec3 ink;
        varying float lit;
        varying float facing;
        varying float guide;
        void main() {
          vec3 surface = fmProject(position);
          vec3 world = (modelMatrix * vec4(surface, 1.0)).xyz;
          vec3 normal = normalize(mat3(modelMatrix) * fmNormal(position));
          facing = mix(smoothstep(0.0, 0.20, dot(normal, normalize(cameraPosition - world))), 1.0, uMorph);
          vec4 projected = modelViewMatrix * vec4(surface, 1.0);
          projected.y -= aDepth * amount;
          guide = aTiming.x < 0.0 ? 1.0 : 0.0;
          lit = aTiming.y == 0.0 ? step(aTiming.x, seconds) : clamp((seconds - aTiming.x) / aTiming.y, 0.0, 1.0);
          ink = aTint;
          gl_Position = projectionMatrix * projected;
        }`,
      fragmentShader: `uniform float amount;
        uniform bool outline;
        varying vec3 ink;
        varying float lit;
        varying float facing;
        varying float guide;
        void main() {
          vec3 tint = mix(vec3(0.046, 0.105, 0.14), ink, mix(lit, 1.0, guide));
          float opacity = outline ? mix(0.26, 0.46, guide) : mix(0.20, 0.88, lit);
          gl_FragColor = vec4(tint, amount * facing * opacity);
          #include <colorspace_fragment>
        }`,
      side: DoubleSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }
  const mesh = new Mesh(new BufferGeometry(), material(false));
  const wires = new LineSegments(new BufferGeometry(), material(true));
  mesh.renderOrder = 5;
  wires.renderOrder = 6;
  mesh.frustumCulled = wires.frustumCulled = false;
  object.add(mesh, wires);
  let model: ObservationFault | undefined;
  return {
    object,
    set(next: ObservationView["fault"]) {
      object.visible = !!next;
      if (next) {
        seconds.value = next.seconds;
        amount.value = next.amount;
      }
      if (model === next?.model) return;
      model = next?.model;
      mesh.geometry.dispose();
      wires.geometry.dispose();
      mesh.geometry = model ? faultGeometry(model, false) : new BufferGeometry();
      wires.geometry = model ? faultGeometry(model, true) : new BufferGeometry();
    },
    dispose() {
      mesh.geometry.dispose();
      wires.geometry.dispose();
      mesh.material.dispose();
      wires.material.dispose();
    },
  };
}
