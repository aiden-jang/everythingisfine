import {
  BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial,
} from "three";
import { MORPH_GLSL } from "./morph";
import { DEG, EARTH_RADIUS_KM } from "../geo/sphere";
import type { SlabPoint } from "../geo/slab";

/*
 * The slab, drawn once and then left alone.
 *
 * Built from a committed table rather than from the store, so unlike the event layer this fills its
 * buffers a single time and never syncs again. There is no filter that applies to it: it is not a
 * reading anybody made today, it is the shape of a plate.
 *
 * The positions carry the depth already. `events.ts` sinks its markers in the shader because their
 * depths arrive with the data and change every tick; these never change, so the trigonometry happens
 * once on the CPU and the shader only has to undo it as the map flattens.
 */

/*
 * The boundaries' family, lifted until it reads.
 *
 * Started at the plate line's own tone and measured: against the ocean at this depth the field was
 * there and could not be seen, which is the worst of both - the cost of drawing 1,583 marks and none
 * of the shape. Lifted to where the sheet resolves, and still nowhere near the ramp, because the one
 * thing this layer must never look like is today's earthquakes.
 */
const COLOR_SLAB = new Color(0x7ba0c8);

/**
 * Small, and fixed.
 *
 * Deliberately not scaled by magnitude. Size means magnitude on this globe and these are not the
 * magnitudes anybody is reading - dotting the frame with 1,583 sized marks would put a second, older,
 * differently-thresholded population into the one channel the live data owns.
 */
const SIZE_PX = 2.5;

const SHADER = {
  vertexShader: /* glsl */ `
    ${MORPH_GLSL}
    attribute float aSink;
    uniform float uPixelRatio;
    uniform float uSize;
    varying float vFacing;

    void main() {
      vec3 surface = normalize(position);
      // Same test the markers use, fading out with the morph because a plane has no far side.
      vFacing = mix(dot(surface, normalize(cameraPosition - surface)), 1.0, uMorph);
      /*
       * Lifted back to the surface as the map unwraps, exactly as the markers are.
       *
       * The offset is added after the projection rather than baked into the radius, because on the
       * plane radius is the layer index: fmProject builds its z from length(sphere) - 1.0, so a point
       * already sunk to 0.9 would be filed a tenth of a world unit under the map and drawn behind the
       * ocean. The positions here are unit vectors for that reason, and the depth rides in aSink.
       *
       * (No backticks in here. This is inside a template literal and one of them ends the shader.)
       */
      vec3 sunk = surface * (-aSink * (1.0 - uMorph));
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position) + sunk, 1.0);
      gl_PointSize = uSize * uPixelRatio;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vFacing;

    void main() {
      if (vFacing <= 0.0) discard;
      // Round rather than square, by hand: a point sprite is a quad and multisampling never sees alpha.
      float d = length(gl_PointCoord - vec2(0.5));
      float alpha = 1.0 - smoothstep(0.30, 0.5, d);
      if (alpha <= 0.0) discard;
      // Faded at the limb, the same way the markers are, so the horizon does not read as a bright rim.
      gl_FragColor = vec4(uColor, alpha * smoothstep(0.0, 0.25, vFacing) * uOpacity);
    }`,
};

export interface SlabLayer {
  object: Points;
  /** Fills the buffers from the committed table. Called once, when the toggle first asks for it. */
  set: (points: readonly SlabPoint[]) => void;
  setPixelRatio: (ratio: number) => void;
  /** 0 hides it. Everything on this globe fades rather than switching. */
  setOpacity: (value: number) => void;
  dispose: () => void;
}

export function createSlabLayer(morph = { value: 0 }): SlabLayer {
  const geometry = new BufferGeometry();
  const material = new ShaderMaterial({
    ...SHADER,
    uniforms: {
      uColor: { value: COLOR_SLAB },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: SIZE_PX },
      // The scene's own value, not a copy: this has to flatten with the geography under it.
      uMorph: morph,
    },
    transparent: true,
    depthWrite: false,
    /*
     * Not depth-tested, for the reason `events.ts` sets out at length: a point sprite carries the single
     * depth of its centre across a screen-aligned quad, so near the limb half of every dot fails against
     * a surface that curves away and the survivors end at a straight edge through the middle. The facing
     * test above is the question that actually wants answering, and it is asked in the fragment.
     */
    depthTest: false,
  });

  const object = new Points(geometry, material);
  // Under the plate lines and everything above them: this is the deepest thing on the globe, and the
  // only layer that is literally beneath the others.
  object.renderOrder = 2;
  object.visible = false;
  object.frustumCulled = false;

  return {
    object,
    set: (points) => {
      const positions = new Float32Array(points.length * 3);
      const sinks = new Float32Array(points.length);
      const lonLats = new Float32Array(points.length * 2);

      for (let i = 0; i < points.length; i += 1) {
        const [lon, lat, depthKm] = points[i]!;
        const phi = lat * DEG;
        const lam = lon * DEG;
        const c = Math.cos(phi);
        positions[i * 3] = c * Math.sin(lam);
        positions[i * 3 + 1] = Math.sin(phi);
        positions[i * 3 + 2] = c * Math.cos(lam);
        sinks[i] = Math.min(depthKm, EARTH_RADIUS_KM) / EARTH_RADIUS_KM;
        lonLats[i * 2] = lon;
        lonLats[i * 2 + 1] = lat;
      }

      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("aSink", new BufferAttribute(sinks, 1));
      geometry.setAttribute("aLonLat", new BufferAttribute(lonLats, 2));
      geometry.setDrawRange(0, points.length);
      // Never computed: the default pass walks every vertex to bound a layer that is always on screen.
      geometry.boundingSphere = null;
    },
    setPixelRatio: (ratio) => {
      material.uniforms["uPixelRatio"]!.value = ratio;
    },
    setOpacity: (value) => {
      const next = Math.max(0, Math.min(1, value));
      material.uniforms["uOpacity"]!.value = next;
      object.visible = next > 0.001;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
