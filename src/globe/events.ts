import { BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from "three";
import type { Filters } from "../data/types";
import type { Store } from "../data/store";
import { matches } from "../data/filter";
import { DEG } from "../geo/sphere";
import { MAG_MIN, rampPosition, rampTexture, type RampName } from "./ramp";

/*
 * Fifty thousand earthquakes, drawn once.
 *
 * `Points` with a custom shader rather than an InstancedMesh of quads. A marker here is a filled
 * circle facing the camera, which is exactly what a point sprite already is, so instancing would
 * buy four vertices and a per-instance matrix each in order to rebuild something the hardware does
 * for free.
 *
 * Everything that varies per event is an attribute, and everything that varies per frame is a
 * uniform. The consequence that matters for DESIGN.md section 11 is that a filter change rewrites
 * two Float32Arrays and touches no object graph at all: no meshes created, none destroyed, and
 * nothing for the garbage collector to find at hour four.
 */

/** Just clear of the coastline stroke, so a marker on a shoreline is never half-swallowed by it. */
const RADIUS_EVENTS = 1.006;

/**
 * Marker radius in CSS pixels: `BASE + SCALE * sqrt(magnitude - MAG_MIN)`.
 *
 * Square root because DESIGN.md asks for area, not width, to read as intensity. Magnitude is
 * already logarithmic in energy, so this is a second compression on top of one, and that is
 * deliberate: the alternative is a magnitude 7 that is a thousand times the width of a magnitude 4
 * and covers the country it happened in.
 */
const RADIUS_BASE = 1.7;
const RADIUS_SCALE = 2.9;

/**
 * Markers hold their size on screen as the camera zooms.
 *
 * A marker that grows with the globe declutters nothing: zooming into a dense margin magnifies the
 * overlap along with everything else. Holding screen size means zooming genuinely separates events,
 * which is the whole reason for zooming into a cluster, and it is what makes the clustering work in
 * step D an addition rather than a rescue.
 */
const SHADER = {
  vertexShader: /* glsl */ `
    attribute float aMag;
    uniform float uPixelRatio;
    uniform float uBase;
    uniform float uScale;
    uniform float uMagMin;
    varying float vRamp;
    varying float vFacing;

    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      // The globe is a unit sphere at the origin, so the surface normal is the position itself.
      // A marker on the far side has its normal pointing away from the eye.
      vec3 normal = normalize(world.xyz);
      vFacing = dot(normal, normalize(cameraPosition - world.xyz));

      vRamp = clamp((aMag - uMagMin) / 6.5, 0.0, 1.0);
      float radius = uBase + uScale * sqrt(max(0.0, aMag - uMagMin));

      gl_Position = projectionMatrix * viewMatrix * world;
      gl_PointSize = 2.0 * radius * uPixelRatio;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uRamp;
    uniform float uOpacity;
    varying float vRamp;
    varying float vFacing;

    void main() {
      // Discarded rather than depth-tested. The markers sit above the globe's surface, so a
      // depth test alone lets the far hemisphere's events shine through the planet.
      if (vFacing <= 0.0) discard;

      // Round, and antialiased by hand: a point sprite is a square and multisampling never sees
      // its alpha. Without the smoothstep every earthquake is a tiny rectangle.
      vec2 offset = gl_PointCoord - vec2(0.5);
      float d = length(offset);
      float alpha = 1.0 - smoothstep(0.42, 0.5, d);
      if (alpha <= 0.0) discard;

      // Events near the limb are foreshortened almost to nothing, and drawing them at full
      // strength makes the horizon a bright ring that reads as data.
      float edge = smoothstep(0.0, 0.25, vFacing);

      gl_FragColor = vec4(texture2D(uRamp, vec2(vRamp, 0.5)).rgb, alpha * edge * uOpacity);
    }`,
};

export interface EventLayer {
  object: Points;
  /** Swaps the entire data palette. One uniform, not fifty thousand rewrites. */
  setRamp: (name: RampName) => void;
  setPixelRatio: (ratio: number) => void;
  /** Writes the visible subset into the buffers. Returns how many are drawn. */
  sync: (store: Store, filters: Filters, now: number) => number;
  dispose: () => void;
}

export function createEventLayer(capacity: number, ramp: RampName = "thermal"): EventLayer {
  // Allocated once at full capacity and never resized. Growing a buffer means a new allocation and
  // a new GPU upload at exactly the moment the app is busiest, which is when a burst arrives.
  const positions = new Float32Array(capacity * 3);
  const magnitudes = new Float32Array(capacity);

  const geometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(positions, 3);
  const magAttr = new BufferAttribute(magnitudes, 1);
  positionAttr.setUsage(35048 /* DynamicDrawUsage */);
  magAttr.setUsage(35048);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aMag", magAttr);
  geometry.setDrawRange(0, 0);
  // Never computed. The default bounding sphere pass walks every vertex, and with a draw range
  // that changes on every filter tick that is a full extra sweep of the buffer for nothing.
  geometry.boundingSphere = null;

  let texture = rampTexture(ramp);

  const material = new ShaderMaterial({
    ...SHADER,
    uniforms: {
      uRamp: { value: texture },
      uPixelRatio: { value: 1 },
      uBase: { value: RADIUS_BASE },
      uScale: { value: RADIUS_SCALE },
      uMagMin: { value: MAG_MIN },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    /*
     * Normal blending, and the first version was additive.
     *
     * Additive looked right in principle: overlapping events in a dense margin read as brighter
     * rather than as one flat blob. On the first frame of real data it was plainly wrong. Twenty
     * events stacked in the Flores Sea summed past the top of the ramp and clipped to pure white,
     * which is Instrument, the chrome colour. A dense cluster was therefore drawing the one colour
     * the interface reserves for text and focus rings, and it was doing it precisely where the data
     * was most interesting.
     *
     * That is not a tuning problem, it is a gamut problem: any additive stack eventually leaves the
     * ramp, so no opacity setting fixes it, it only moves the density at which it breaks. Normal
     * blending keeps every pixel inside the ramp by construction. Density is then the clustering
     * job in step D, which is where it belonged anyway.
     */
    blending: NormalBlending,
  });

  const object = new Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 4;

  return {
    object,
    setRamp: (name) => {
      texture.dispose();
      texture = rampTexture(name);
      material.uniforms["uRamp"]!.value = texture;
    },
    setPixelRatio: (ratio) => {
      material.uniforms["uPixelRatio"]!.value = ratio;
    },

    sync: (store, filters, now) => {
      let n = 0;
      store.forEach((quake) => {
        if (n >= capacity) return;
        if (!matches(quake, filters, now)) return;

        const r = quake.primary;
        // Inlined rather than calling toVec3, which returns a fresh three-element array. At fifty
        // thousand events that is fifty thousand short-lived arrays per filter tick, and the
        // allocation dominates the trigonometry it was hiding.
        const phi = r.lat * DEG;
        const lam = r.lon * DEG;
        const c = Math.cos(phi) * RADIUS_EVENTS;
        const i = n * 3;
        positions[i] = c * Math.sin(lam);
        positions[i + 1] = Math.sin(phi) * RADIUS_EVENTS;
        positions[i + 2] = c * Math.cos(lam);
        magnitudes[n] = r.magnitude;
        n += 1;
      });

      geometry.setDrawRange(0, n);
      // Only the written span is uploaded. Handing the driver the whole 50k buffer to redraw 200
      // visible events is the difference between a filter that answers the slider and one that
      // stutters behind it.
      positionAttr.updateRanges = [{ start: 0, count: n * 3 }];
      magAttr.updateRanges = [{ start: 0, count: n }];
      positionAttr.needsUpdate = true;
      magAttr.needsUpdate = true;
      return n;
    },

    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

export { rampPosition };
