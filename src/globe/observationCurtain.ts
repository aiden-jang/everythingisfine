import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
} from "three";
import type { ObservationView } from "../app/observations/types";
import { toVec3 } from "../geo/sphere";
import { MORPH_GLSL } from "./morph";

type Curtain = NonNullable<ObservationView["curtain"]>;

export function curtainGeometry(points: Curtain["points"], heightKm: number, exaggeration: number) {
  const position: number[] = [],
    coordinates: number[] = [],
    uv: number[] = [],
    index: number[] = [];
  const strip: { lon: number; lat: number; u: number; break?: boolean }[] = [];
  points.forEach((p, i) => {
    const previous = points[i - 1];
    if (previous && Math.abs(p.lon - previous.lon) > 180) {
      const edge = previous.lon > 0 ? 180 : -180;
      const t = (edge - previous.lon) / (p.lon - previous.lon + edge * 2);
      const lat = previous.lat + (p.lat - previous.lat) * t;
      const u = (i - 1 + t) / (points.length - 1);
      strip.push({ lon: edge, lat, u }, { lon: -edge, lat, u, break: true });
    }
    strip.push({ ...p, u: i / (points.length - 1) });
  });
  strip.forEach((p, i) => {
    for (const top of [0, 1]) {
      position.push(...toVec3(p.lon, p.lat, 1.013 + (top * heightKm * exaggeration) / 6371));
      coordinates.push(p.lon, p.lat);
      uv.push(p.u, top);
    }
    if (i && !p.break) index.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i - 1, 2 * i, 2 * i + 1);
  });
  return new BufferGeometry()
    .setAttribute("position", new BufferAttribute(new Float32Array(position), 3))
    .setAttribute("aLonLat", new BufferAttribute(new Float32Array(coordinates), 2))
    .setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2))
    .setIndex(index);
}

export function createObservationCurtain(morph: { value: number }) {
  const material = new ShaderMaterial({
    uniforms: {
      uMorph: morph,
      opened: { value: 0 },
      down: { value: false },
      map: { value: null as Texture | null },
    },
    vertexShader: `${MORPH_GLSL}
      uniform float opened;
      uniform bool down;
      varying vec2 sampleAt;
      void main() {
        sampleAt=vec2(uv.x,down ? 1.0-uv.y : uv.y);
        float rise=(length(position)-1.013)*opened;
        vec3 foot=normalize(position)*1.013;
        vec3 direction=fmNormal(foot);
        if(down) direction=normalize(vec3(0.0,-1.0,0.0)+normalize(foot)*0.45);
        vec3 vertex=fmProject(foot) + direction*rise*(1.0-uMorph);
        if(down) vertex.y -= uMorph*rise;
        else vertex.x += uMorph*rise;
        vertex.z += uMorph*rise*0.2;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(vertex,1.0);
      }`,
    fragmentShader: `uniform sampler2D map; uniform float opened; varying vec2 sampleAt;
      void main(){ gl_FragColor=texture2D(map,sampleAt); gl_FragColor.a *= opened*0.94;
      #include <colorspace_fragment>
      }`,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const object = new Mesh(new BufferGeometry(), material);
  object.visible = false;
  object.frustumCulled = false;
  object.renderOrder = 7;
  let prior: Curtain | undefined;
  let amount = 0;
  return {
    object,
    set(next: Curtain | undefined) {
      if (next?.image === prior?.image) {
        prior = next;
        return;
      }
      if (!next) {
        prior = next;
        return;
      }
      material.uniforms.map!.value?.dispose();
      material.uniforms.map!.value = null;
      object.geometry.dispose();
      object.visible = true;
      if (!prior) amount = 0;
      if (next) {
        const texture = new Texture(next.image);
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
        material.uniforms.map!.value = texture;
        material.uniforms.down!.value = !!next.down;
        object.geometry = curtainGeometry(next.points, next.heightKm, next.exaggeration);
      }
      prior = next;
    },
    dispose() {
      material.uniforms.map!.value?.dispose();
      material.uniforms.map!.value = null;
      object.geometry.dispose();
    },
    step(dt: number, reduced: boolean) {
      const goal = prior ? 1 : 0;
      if (!object.visible && !prior) return false;
      amount = reduced ? goal : Math.max(0, Math.min(1, amount + ((prior ? 1 : -1) * dt) / 0.8));
      material.uniforms.opened!.value = 1 - (1 - amount) ** 3;
      if (!prior && amount === 0) {
        object.visible = false;
        material.uniforms.map!.value?.dispose();
        material.uniforms.map!.value = null;
      }
      return amount !== goal;
    },
  };
}
