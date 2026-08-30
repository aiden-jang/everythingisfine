import {
  BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial,
} from "three";
import { MORPH_GLSL } from "./morph";
import { DEG, EARTH_RADIUS_KM } from "../geo/sphere";
import type { SlabPoint } from "../geo/slab";

/* The slab, filled once and left alone. Built from a committed table, so no filter applies: it is not a
   reading anybody made today, it is the shape of a plate. See ARCHITECTURE.md. */

/*
 * The boundaries' family, lifted until it reads. At the plate line's own tone the field was there and could
 * not be seen - the cost of 1,583 marks and none of the shape. Still nowhere near the ramp, because the one
 * thing this layer must never look like is today's earthquakes.
 */
const COLOR_SLAB = 0x7ba0c8;

/** The same lift applied to the colourblind palette's own boundary tone. See ARCHITECTURE.md. */
const COLOR_SLAB_NEUTRAL = 0x9ea2ae;

/**
 * Small, and fixed. Deliberately not scaled by magnitude: size means magnitude on this globe, and 1,583
 * sized marks would put an older, differently-thresholded population into the channel the live data owns.
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
      /* Lifted back to the surface as the map unwraps, exactly as the markers are. See ARCHITECTURE.md. */
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
  /** Follows the geography palette, because this layer is drawn as geography rather than as data. */
  setRamp: (ramp: "thermal" | "cividis") => void;
  /** 0 hides it. Everything on this globe fades rather than switching. */
  setOpacity: (value: number) => void;
  dispose: () => void;
}

export function createSlabLayer(morph = { value: 0 }): SlabLayer {
  const geometry = new BufferGeometry();
  const material = new ShaderMaterial({
    ...SHADER,
    uniforms: {
      uColor: { value: new Color(COLOR_SLAB) },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: SIZE_PX },
      // The scene's own value, not a copy: this has to flatten with the geography under it.
      uMorph: morph,
    },
    transparent: true,
    depthWrite: false,
    // Not depth-tested, for the reason `events.ts` sets out: a point sprite carries the single depth of its
    // centre across a screen-aligned quad, so near the limb half of every dot fails against a surface that
    // curves away. The facing test above is the question that actually wants answering.
    depthTest: false,
  });

  const object = new Points(geometry, material);
  // Under the plate lines and everything above them: the deepest thing on the globe, and the only layer
  // that is literally beneath the others.
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
    setRamp: (ramp) => {
      (material.uniforms["uColor"]!.value as Color)
        .setHex(ramp === "cividis" ? COLOR_SLAB_NEUTRAL : COLOR_SLAB);
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
