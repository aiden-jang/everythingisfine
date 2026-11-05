import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import type { SequenceRun } from "../app/sequenceReplay";
import { toVec3 } from "../geo/sphere";
import { markerRadiusPx } from "./events";
import { MAG_MAX, MAG_MIN, rampTexture } from "./ramp";
import type { createRegionalFraming } from "./regionalFraming";

export function createSequencePresentation(framing: ReturnType<typeof createRegionalFraming>) {
  let run: SequenceRun | null = null;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uClock: { value: 0 },
      uQuiet: { value: false },
      uRamp: { value: rampTexture("thermal") },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uClock;
      uniform float uPixelRatio;
      uniform bool uQuiet;
      attribute float aCue;
      attribute float aSize;
      attribute float aMagnitude;
      attribute float aPin;
      varying float vGlow;
      varying float vMagnitude;
      varying float vPin;
      void main() {
        vGlow = uQuiet ? 0.0 : 1.0 - smoothstep(0.0, mix(0.42, 0.84, aPin), uClock - aCue);
        vPin = aPin;
        vMagnitude = aMagnitude;
        gl_PointSize = (aSize + (4.0 + 26.0 * vGlow) * aPin + 8.0 * vGlow) * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uRamp;
      varying float vGlow;
      varying float vMagnitude;
      varying float vPin;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float glow = vGlow;
        float core = 1.0 - smoothstep(0.16 + (1.0 - glow) * 0.2, 0.45, radius);
        float aura = glow * 0.32 * (1.0 - smoothstep(0.14, 0.88, radius));
        float bracket = vPin * (1.0 - smoothstep(0.035, 0.11, abs(radius - (0.65 + 0.23 * (1.0 - glow)))));
        vec3 hue = texture2D(uRamp, vec2(vMagnitude, 0.5)).rgb;
        vec3 light = mix(hue, vec3(0.91, 0.96, 1.0), max(vPin * 0.4, bracket));
        gl_FragColor = vec4(light, max(max(core, aura), bracket * (0.56 + glow * 0.4)));
      }`,
  });
  const object = new Points(new BufferGeometry(), material);
  object.frustumCulled = false;
  object.renderOrder = 9;
  object.visible = false;

  return {
    object,
    set(next: SequenceRun | null): void {
      run = next;
      object.visible = false;
      object.geometry.dispose();
      object.geometry = new BufferGeometry();
      if (!next) return;
      const { events, pin, radiusKm } = next;
      const position = events.flatMap(({ reading }) => toVec3(reading.lon, reading.lat, 1.008));
      const attribute = (values: number[], size = 1) => new BufferAttribute(new Float32Array(values), size);
      object.geometry.setAttribute("position", attribute(position, 3));
      object.geometry.setAttribute("aCue", attribute(events.map(({ cue }) => cue)));
      object.geometry.setAttribute(
        "aSize",
        attribute(events.map(({ reading }) => markerRadiusPx(reading.magnitude, 1) * 2.8)),
      );
      object.geometry.setAttribute(
        "aMagnitude",
        attribute(events.map(({ reading }) => (reading.magnitude - MAG_MIN) / (MAG_MAX - MAG_MIN))),
      );
      object.geometry.setAttribute("aPin", attribute(events.map(({ pinned }) => Number(pinned))));
      object.geometry.setDrawRange(0, 0);
      material.uniforms["uRamp"]!.value.dispose();
      material.uniforms["uRamp"]!.value = rampTexture(next.ramp);
      framing.aim({ lon: pin.lon, lat: pin.lat, zoom: 2.65 }, Math.min(9, 480 / Math.max(70, radiusKm)));
    },
    step(dt: number, reduced: boolean): boolean {
      if (!run) return false;
      const frame = run.step(dt, reduced);
      framing.step(frame.approach);
      object.visible = frame.shown > 0;
      object.geometry.setDrawRange(0, frame.shown);
      material.uniforms["uClock"]!.value = frame.elapsed;
      material.uniforms["uQuiet"]!.value = reduced;
      material.uniforms["uPixelRatio"]!.value = Math.min(devicePixelRatio, 2);
      return frame.moving;
    },
    dispose(): void {
      object.removeFromParent();
      object.geometry.dispose();
      material.uniforms["uRamp"]!.value.dispose();
      material.dispose();
    },
  };
}
