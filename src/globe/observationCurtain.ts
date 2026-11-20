import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
} from "three";
import type { MooringSection, ObservationView } from "../app/observations/types";
import { EARTH_RADIUS_KM, toVec3 } from "../geo/sphere";
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
      position.push(...toVec3(p.lon, p.lat, 1.013 + (top * heightKm * exaggeration) / EARTH_RADIUS_KM));
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

const curtainProjection = `${MORPH_GLSL}
  uniform float opened;
  uniform bool down;
  vec4 projectSection(){
    float rise=(length(position)-1.013)*opened;
    vec3 foot=normalize(position)*1.013;
    vec3 direction=fmNormal(foot);
    if(down) direction=normalize(vec3(0.0,-1.0,0.0)+normalize(foot)*0.45);
    vec3 vertex=fmProject(foot) + direction*rise*(1.0-uMorph);
    if(down) vertex.y -= uMorph*rise;
    else vertex.x += uMorph*rise;
    vertex.z += uMorph*rise*0.2;
    return projectionMatrix*modelViewMatrix*vec4(vertex,1.0);
  }`;

export function mooringGeometry(section: MooringSection, exaggeration: number) {
  const positions: number[] = [],
    coordinates: number[] = [];
  for (const { lon, depth } of section.readings) {
    const radius = 1.013 + ((depth - section.topDepth) * exaggeration) / (1000 * EARTH_RADIUS_KM);
    // The cut passes through the 180° mooring. Its profile borders both halves of the map.
    for (const longitude of lon === -180 ? [-180, 180] : [lon]) {
      coordinates.push(longitude, 0);
      positions.push(...toVec3(longitude, 0, radius));
    }
  }
  return new BufferGeometry()
    .setAttribute("position", new BufferAttribute(new Float32Array(positions), 3))
    .setAttribute("aLonLat", new BufferAttribute(new Float32Array(coordinates), 2));
}

export function createObservationCurtain(morph: { value: number }) {
  const material = new ShaderMaterial({
    uniforms: {
      uMorph: morph,
      opened: { value: 0 },
      down: { value: false },
      map: { value: null as Texture | null },
    },
    vertexShader: `${curtainProjection}
      varying vec2 sampleAt;
      void main(){
        sampleAt=vec2(uv.x,down ? 1.0-uv.y : uv.y);
        gl_Position=projectSection();
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
  const sampleOpacity = { value: 0 };
  const samples = new Points(
    new BufferGeometry(),
    new ShaderMaterial({
      uniforms: { ...material.uniforms, sampleOpacity, pixelRatio: { value: 1 } },
      vertexShader: `${curtainProjection}
      uniform float pixelRatio;
      void main(){ gl_Position=projectSection(); gl_PointSize=4.5*pixelRatio; }`,
      fragmentShader: `uniform float opened; uniform float sampleOpacity;
      void main(){
        float r=2.0*length(gl_PointCoord-0.5);
        float edge=max(fwidth(r),0.02);
        float ink=smoothstep(0.54-edge,0.54+edge,r);
        vec3 color=mix(vec3(0.94,0.97,0.94),vec3(0.035,0.065,0.08),ink);
        gl_FragColor=vec4(color,(1.0-smoothstep(1.0-edge,1.0,r))*opened*sampleOpacity);
        #include <colorspace_fragment>
      }`,
      transparent: true,
      depthWrite: false,
    }),
  );
  samples.onBeforeRender = (renderer) => {
    samples.material.uniforms.pixelRatio!.value = renderer.getPixelRatio();
  };
  samples.visible = false;
  samples.frustumCulled = false;
  samples.renderOrder = 8;
  object.add(samples);
  object.visible = false;
  object.frustumCulled = false;
  object.renderOrder = 7;
  let prior: Curtain | undefined;
  let amount = 0;
  return {
    object,
    set(next: Curtain | undefined) {
      if (next?.moorings !== prior?.moorings) {
        samples.visible = !!next?.moorings;
        if (!prior?.moorings) sampleOpacity.value = 0;
        samples.geometry.dispose();
        samples.geometry = next?.moorings
          ? mooringGeometry(next.moorings, next.exaggeration)
          : new BufferGeometry();
      }
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
      samples.geometry.dispose();
      samples.material.dispose();
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
      if (samples.visible) sampleOpacity.value = reduced ? 1 : Math.min(1, sampleOpacity.value + dt / 0.2);
      return amount !== goal || (samples.visible && sampleOpacity.value < 1);
    },
  };
}
