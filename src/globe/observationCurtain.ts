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
  points.forEach((p, i) => {
    for (const top of [0, 1]) {
      position.push(...toVec3(p.lon, p.lat, 1.013 + (top * heightKm * exaggeration) / 6371));
      coordinates.push(p.lon, p.lat);
      uv.push(i / (points.length - 1), top);
    }
    if (i) index.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i - 1, 2 * i, 2 * i + 1);
  });
  return new BufferGeometry()
    .setAttribute("position", new BufferAttribute(new Float32Array(position), 3))
    .setAttribute("aLonLat", new BufferAttribute(new Float32Array(coordinates), 2))
    .setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2))
    .setIndex(index);
}

export function createObservationCurtain(morph: { value: number }) {
  const material = new ShaderMaterial({
    uniforms: { uMorph: morph, opened: { value: 0 }, map: { value: null as Texture | null } },
    vertexShader: `${MORPH_GLSL}
      uniform float opened;
      varying vec2 sampleAt;
      void main() {
        sampleAt=uv;
        float rise=(length(position)-1.013)*opened;
        vec3 foot=normalize(position)*1.013;
        vec3 vertex=fmProject(foot) + fmNormal(foot)*rise*(1.0-uMorph);
        vertex.x += uMorph*rise;
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
      amount = 0;
      if (next) {
        const texture = new Texture(next.image);
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
        material.uniforms.map!.value = texture;
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
