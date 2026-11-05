import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  type Vector3,
} from "three";
import { toVec3 } from "../geo/sphere";
import type { AuroraRoute, OvalPoint } from "../sources/auroraRoute";

const vertexShader = /* glsl */ `
  attribute float aHeight;
  attribute float aChance;
  attribute float aSweep;
  varying float vHeight;
  varying float vChance;
  varying float vSweep;
  varying vec3 vGround;
  void main() {
    vHeight = aHeight;
    vChance = aChance;
    vSweep = aSweep;
    vGround = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSun;
  uniform float uTrace;
  varying float vHeight;
  varying float vChance;
  varying float vSweep;
  varying vec3 vGround;
  void main() {
    float night = 1.0 - smoothstep(-0.28, -0.07, dot(normalize(vGround), uSun));
    float trace = 1.0 - smoothstep(uTrace - 0.1, uTrace, vSweep);
    float head = (1.0 - smoothstep(0.015, 0.075, abs(uTrace - vSweep - 0.055))) * step(uTrace, 1.0);
    float light = pow(vChance, 0.64) * night * trace * (1.0 + 0.55 * head);
    float edge = smoothstep(0.0, 0.13, vHeight) * pow(1.0 - vHeight, 1.55);
    vec3 color = mix(vec3(0.26, 1.0, 0.64), vec3(0.39, 0.59, 0.97), vHeight);
    gl_FragColor = vec4(color, light * edge * 1.28);
  }`;

function softenedOval(oval: AuroraRoute["oval"]): AuroraRoute["oval"] {
  return oval.map((point, index) => {
    if (!point) return null;
    let latitude = point.lat * 3;
    let weight = 3;
    for (const direction of [-1, 1]) {
      let previous = point;
      for (let step = 1; step <= 2; step++) {
        const next = oval[(index + step * direction + oval.length) % oval.length];
        if (!next || Math.abs(next.lat - previous.lat) > 7) break;
        latitude += next.lat * (3 - step);
        weight += 3 - step;
        previous = next;
      }
    }
    return { ...point, lat: latitude / weight };
  });
}

export function createAuroraVeil(sun: Vector3) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uSun: { value: sun }, uTrace: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const object = new Mesh(new BufferGeometry(), material);
  object.visible = false;
  object.renderOrder = 5;

  function set(route: AuroraRoute | null) {
    object.geometry.dispose();
    object.geometry = new BufferGeometry();
    if (!route) {
      object.visible = false;
      return;
    }

    const positions: number[] = [];
    const heights: number[] = [];
    const chances: number[] = [];
    const sweeps: number[] = [];
    const sweepAt = (lon: number) => {
      const span = Math.abs(lon - route.focus.lon);
      return Math.min(span, 360 - span) / 180;
    };
    function vertex(point: OvalPoint, height: number) {
      positions.push(...toVec3(point.lon, point.lat, 1.006 + height * 0.046));
      heights.push(height);
      chances.push(point.probability / 100);
      sweeps.push(sweepAt(point.lon));
    }

    const oval = softenedOval(route.oval);
    for (let lon = 0; lon < oval.length; lon++) {
      const next = (lon + 1) % oval.length;
      const a = oval[lon];
      const b = oval[next];
      const originalA = route.oval[lon];
      const originalB = route.oval[next];
      // Keep gaps in the modeled ribbon, including changes between disconnected arcs.
      if (!a || !b || !originalA || !originalB || Math.abs(originalA.lat - originalB.lat) > 7) continue;
      vertex(a, 0);
      vertex(b, 0);
      vertex(a, 1);
      vertex(a, 1);
      vertex(b, 0);
      vertex(b, 1);
    }
    object.geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    object.geometry.setAttribute("aHeight", new BufferAttribute(new Float32Array(heights), 1));
    object.geometry.setAttribute("aChance", new BufferAttribute(new Float32Array(chances), 1));
    object.geometry.setAttribute("aSweep", new BufferAttribute(new Float32Array(sweeps), 1));
    object.visible = positions.length > 0;
  }

  return {
    object,
    set,
    trace: (progress: number) => {
      material.uniforms["uTrace"]!.value = progress * 1.1;
    },
  };
}
