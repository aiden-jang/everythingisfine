import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import type { WaveRun } from "../app/waveReplay";
import { DEG, EARTH_RADIUS_KM, toVec3 } from "../geo/sphere";
import type { createRegionalFraming } from "./regionalFraming";

const P_COLOR = 0xffd18a;
const S_COLOR = 0x83daff;
const SURFACE = 1.006;

function waveRing(color: number) {
  return new Mesh(
    new RingGeometry(0.89, 1, 96),
    new ShaderMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: { uTint: { value: new Color(color) } },
      vertexShader: /* glsl */ `
        varying vec2 vRingUv;
        void main() {
          vRingUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec2 vRingUv;
        void main() {
          float edge = length(vRingUv - 0.5) * 2.0;
          float wake = 0.22 * smoothstep(0.89, 0.98, edge);
          float crest = 0.75 * smoothstep(0.978, 0.99, edge);
          gl_FragColor = vec4(uTint, (wake + crest) * (1.0 - smoothstep(0.994, 1.0, edge)));
          #include <colorspace_fragment>
        }`,
    }),
  );
}

function siteMark(sides: number) {
  return new Mesh(
    new CircleGeometry(1, sides),
    new MeshBasicMaterial({ color: 0xe1eafa, side: DoubleSide, transparent: true, depthWrite: false }),
  );
}

export function createWavePresentation(framing: ReturnType<typeof createRegionalFraming>) {
  const object = new Group();
  const pRing = waveRing(P_COLOR);
  const sRing = waveRing(S_COLOR);
  const origin = siteMark(24);
  const city = siteMark(4);
  const route = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({ color: 0xa0b9d7, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  const up = new Vector3(0, 0, 1);
  const from = new Vector3();
  const to = new Vector3();
  const midpoint = new Vector3();
  let run: WaveRun | null = null;
  let markerSize = 0;
  object.visible = false;
  object.add(route, pRing, sRing, origin, city);
  route.renderOrder = 7;
  pRing.renderOrder = sRing.renderOrder = 8;
  origin.renderOrder = city.renderOrder = 9;

  function drawRing(ring: typeof pRing, angle: number) {
    ring.visible = angle > 0;
    if (!ring.visible) return;
    ring.position.copy(from).multiplyScalar(Math.cos(angle) * SURFACE);
    ring.scale.setScalar(Math.sin(angle) * SURFACE);
  }

  return {
    object,
    set(next: WaveRun | null) {
      run = next;
      object.visible = false;
      if (!next) return;
      const path = next.route;
      from.set(...toVec3(path.origin.lon, path.origin.lat, 1));
      to.set(...toVec3(path.city.lon, path.city.lat, 1));
      midpoint.copy(from).add(to).normalize();
      const points = Array.from({ length: 17 }, (_, i) =>
        new Vector3()
          .lerpVectors(from, to, i / 16)
          .normalize()
          .multiplyScalar(SURFACE),
      );
      route.geometry.setFromPoints(points);
      route.geometry.computeBoundingSphere();
      for (const ring of [pRing, sRing]) ring.quaternion.setFromUnitVectors(up, from);
      origin.position.copy(from).multiplyScalar(SURFACE + 0.001);
      city.position.copy(to).multiplyScalar(SURFACE + 0.001);
      origin.quaternion.setFromUnitVectors(up, from);
      city.quaternion.setFromUnitVectors(up, to);
      markerSize = Math.max(0.00035, (path.km / EARTH_RADIUS_KM) * 0.019);
      origin.scale.setScalar(markerSize);
      framing.aim(
        {
          lon: Math.atan2(midpoint.x, midpoint.z) / DEG,
          lat: Math.asin(midpoint.y) / DEG,
          zoom: 2.65,
        },
        Math.max(1, Math.min(8, 440 / path.km)),
      );
    },
    step(dt: number, reduced: boolean) {
      if (!run) return false;
      const shot = run.step(dt, reduced);
      framing.step(shot.approach);
      object.visible = shot.approach > 0.4;
      drawRing(pRing, shot.pAngle);
      drawRing(sRing, shot.sAngle);
      const pArrived = shot.at >= run.route.p;
      const sArrived = shot.at >= run.route.s;
      city.material.color.setHex(sArrived ? S_COLOR : pArrived ? P_COLOR : 0x8295ad);
      city.scale.setScalar(markerSize * (sArrived ? 2.5 : pArrived ? 2 : 1.2));
      return shot.moving;
    },
    dispose() {
      object.removeFromParent();
      for (const shape of [pRing, sRing, origin, city, route]) {
        shape.geometry.dispose();
        shape.material.dispose();
      }
    },
  };
}
