import { BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from "three";
import type { Filters } from "../data/types";
import type { Store } from "../data/store";
import { matches } from "../data/filter";
import { DEG } from "../geo/sphere";
import { MAG_MIN, rampTexture, type RampName } from "./ramp";
import { cellKey, cellSizeDeg } from "./cluster";
import { MORPH_GLSL } from "./morph";

/*
 * Depth is drawn as shape: a solid disc near the surface, a ring below 300km.
 *
 * Hue and radius both mean magnitude already, and a second hue is not allowed, so shape is the only
 * channel left. Deep events are rare on a single day - about one in eighty - so the legend prints the
 * counts rather than promising a picture that usually is not there.
 */
import { DEPTH_DEEP_KM, DEPTH_SHALLOW_KM } from "../data/depth";
import { EARTH_RADIUS_KM } from "../geo/sphere";

/*
 * Fifty thousand earthquakes in one draw call.
 *
 * `Points` with a custom shader, not instanced quads: a point sprite is already a camera-facing disc,
 * so instancing would rebuild what the hardware does for free. A filter change rewrites two
 * Float32Arrays and creates no objects, which is what keeps hour four as cheap as minute one.
 */

/** Just clear of the coastline stroke, so a marker on a shoreline is never half-swallowed by it. */
const RADIUS_EVENTS = 1.006;

/**
 * Marker radius in CSS pixels: `BASE + SCALE * (magnitude - MAG_MIN) ^ EXPONENT`.
 *
 * The exponent is the whole design. At 1.0 an M7 covers the country it happened in. At 0.5 the entire
 * scale spanned 4.6px to 8.8px, so the key promised "size shows it too" and the globe showed dots.
 * 0.7 holds the small end still and opens the top to 13.5px.
 */
const RADIUS_BASE = 1.0;
const RADIUS_SCALE = 3.6;
const RADIUS_EXPONENT = 0.7;

/**
 * The radius the shader will draw. The hit test imports it.
 *
 * Don't write the formula out a second time. The copy that used to live in the hit test would have
 * drifted on this very change, and the pointer would pick at a radius nobody can see.
 */
export function markerRadiusPx(magnitude: number, scale: number): number {
  const above = Math.max(0, magnitude - MAG_MIN);
  return (RADIUS_BASE + RADIUS_SCALE * Math.pow(above, RADIUS_EXPONENT)) * scale;
}

/*
 * How far below the surface an event sits, in globe radii.
 *
 * Depth arrives twice on purpose. `aDepth` saturates at 300km, which is right for the hole in a marker
 * and useless as a position, because deep events run to 700. Shared with the hit test for the same
 * reason as `markerRadiusPx`.
 */
export function sinkFraction(depthKm: number): number {
  /*
   * One answer for every bad depth: draw it shallow.
   *
   * NaN, a negative, and a decimal point in the wrong place all mean the same thing, and the first
   * version put two of them 6371km apart. Most catalogued earthquakes really are shallow.
   */
  if (!(depthKm > 0) || depthKm > EARTH_RADIUS_KM) return 0;
  return depthKm / EARTH_RADIUS_KM;
}

/** Globe radius the sizes above were chosen against: a desktop window at the framing shot. */
const REFERENCE_RADIUS_PX = 300;

/**
 * Markers hold their size on screen as the camera zooms.
 *
 * Growing them with the globe would magnify the crowding along with everything else, so zooming into a
 * dense margin would never separate anything.
 */
const SHADER = {
  vertexShader: /* glsl */ `
    ${MORPH_GLSL}
    attribute float aMag;
    attribute float aCluster;
    attribute float aFocus;
    uniform float uPixelRatio;
    uniform float uBase;
    uniform float uScale;
    uniform float uExp;
    uniform float uSize;
    uniform float uMagMin;
    uniform float uSink;
    attribute float aSink;
    varying float vRamp;
    varying float vFacing;
    varying float vCluster;
    varying float vDepth;
    varying float vFocus;

    void main() {
      vCluster = aCluster;
      /*
        Derived from aSink, not uploaded. They were one depth written twice: two array writes per event
        and two 50k-float uploads per frame. Only this direction works, because aDepth stops at 300km.
      */
      float aDepthKm = aSink * ${EARTH_RADIUS_KM.toFixed(1)};
      vDepth = clamp(
        (aDepthKm - ${DEPTH_SHALLOW_KM.toFixed(1)}) / ${(DEPTH_DEEP_KM - DEPTH_SHALLOW_KM).toFixed(1)},
        0.0, 1.0
      );
      vFocus = aFocus;
      vec4 world = modelMatrix * vec4(position, 1.0);
      // The globe is a unit sphere at the origin, so a point's position is also its surface normal.
      vec3 normal = normalize(world.xyz);
      // A map has no far side, so the facing test fades out with the morph. Left on, it would delete
      // half the earthquakes on the plane.
      vFacing = mix(dot(normal, normalize(cameraPosition - world.xyz)), 1.0, uMorph);

      vRamp = clamp((aMag - uMagMin) / 6.5, 0.0, 1.0);
      // A cluster is drawn a little wider to leave room for its ring. The fill still means magnitude.
      float radius = (uBase + uScale * pow(max(0.0, aMag - uMagMin), uExp)) * uSize + aCluster * 2.0;

      /*
        Sunk to the hypocentre, so the scatter resolves into the slab: orbit Chile and the events form a
        plane dipping under the arc.

        Add the offset AFTER fmProject, never by shrinking position first. On the flat map radius IS the
        layer index - fmProject builds z from length(sphere) - 1.0 - so a marker pushed in to 0.89 gets filed
        under the map and drawn behind the ocean.

        (No backticks anywhere in this file's shaders. One ends the template literal, and the error lands
        twenty lines from the comment that caused it.)
      */
      // position, not world: the model matrix draws the flat map more than once.
      vec3 sunk = normalize(position) * (-aSink * uSink * (1.0 - uMorph));
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position) + sunk, 1.0);
      gl_PointSize = 2.0 * radius * uPixelRatio;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uRamp;
    uniform float uOpacity;
    uniform float uFocusing;
    varying float vRamp;
    varying float vFacing;
    varying float vCluster;
    varying float vDepth;
    varying float vFocus;

    void main() {
      // Discarded, not depth-tested. Markers float above the surface, so a depth test alone lets the
      // far hemisphere shine through the planet.
      if (vFacing <= 0.0) discard;

      // Antialiased by hand. A point sprite is a square and multisampling never sees its alpha, so
      // without the smoothstep every earthquake is a tiny rectangle.
      vec2 offset = gl_PointCoord - vec2(0.5);
      float d = length(offset);
      float alpha = 1.0 - smoothstep(0.42, 0.5, d);
      if (alpha <= 0.0) discard;

      // Events near the limb are squashed almost to nothing, and at full strength the horizon becomes
      // a bright ring that reads as data.
      float edge = smoothstep(0.0, 0.25, vFacing);

      /*
        The hole opens with depth: solid at the surface, a ring below 300km. The outer edge never
        moves, because that edge is the magnitude.
      */
      if (vDepth > 0.02) {
        float hole = 0.30 * vDepth;
        alpha *= smoothstep(hole - 0.05, hole + 0.02, d);
        if (alpha <= 0.0) discard;
      }

      /*
        Hovering an hour on the strip dims everything else. Opacity only: hue, size and the hole are
        all spoken for, and this is a passing answer to "which of these happened then".
      */
      alpha *= mix(1.0, mix(0.15, 1.0, vFocus), uFocusing);

      vec3 colour = texture2D(uRamp, vec2(vRamp, 0.5)).rgb;

      /*
        A cluster wears a chrome ring, not a bigger radius or its own hue - both of those mean
        magnitude. The ring is the interface admitting it folded something up.
      */
      if (vCluster > 0.5) {
        float ring = smoothstep(0.30, 0.35, d) * (1.0 - smoothstep(0.40, 0.45, d));
        colour = mix(colour, vec3(0.910, 0.929, 0.961), ring * 0.85);
      }

      gl_FragColor = vec4(colour, alpha * edge * uOpacity);
    }`,
};

export interface EventLayer {
  object: Points;
  /** Swaps the entire data palette. One uniform, not fifty thousand rewrites. */
  setRamp: (name: RampName) => void;
  setFocusFade: (value: number) => void;
  setPixelRatio: (ratio: number) => void;
  /**
   * Scales markers to the globe's size on screen, not to the zoom.
   *
   * Constant pixels across viewports is what breaks: at 600px wide the globe is 110px across and an M2
   * marker was 9 of them, so 775 events buried the coastlines. Changes on resize, never while zooming.
   */
  setGlobeRadius: (px: number) => void;
  /** Surface or true depth: 0 or 1, eased between. A uniform, so nothing rewrites fifty thousand positions. */
  setDepthSink: (value: number) => void;
  /**
   * Writes the visible subset into the buffers. Returns how many are drawn.
   *
   * `revealUntil` is the entrance replay, and it is an argument rather than a `Filters` field because
   * it is not a filter: a filter is a choice worth putting in a permalink, this is staging.
   */
  sync: (
    store: Store, filters: Filters, now: number, zoom: number, revealUntil?: number,
    focus?: FocusSpan | null,
  ) => number;
  dispose: () => void;
}

/**
 * The slice of time the pointer is holding, as a span rather than a bucket index.
 *
 * A bucket is `windowMs / 24`, so at 30 days it is thirty hours, not one. The strip knows its own
 * bucket width and converts there; this layer must not guess.
 */
export interface FocusSpan {
  /** Oldest origin time in the held bucket, inclusive. */
  from: number;
  /** Newest, exclusive. */
  to: number;
}

export function createEventLayer(
  capacity: number, ramp: RampName = "thermal", morph = { value: 0 },
): EventLayer {
  // Allocated once at full capacity. Growing means a new upload exactly when a burst arrives.
  const positions = new Float32Array(capacity * 3);
  const magnitudes = new Float32Array(capacity);
  const clusters = new Float32Array(capacity);
  /** Depth again, as a distance rather than a ramp. See `sinkFraction`. */
  const sinks = new Float32Array(capacity);
  /** Written beside the positions: the map projects from these, not from the sphere point. */
  const lonLats = new Float32Array(capacity * 2);
  /** 1 when a marker holds an event inside the hovered hour, 0 otherwise. Only read while hovering. */
  const focuses = new Float32Array(capacity);
  /** Reused between syncs. A fresh Map per filter tick is the allocation the budget catches. */
  const cellFor = new Map<number, number>();

  const geometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(positions, 3);
  const magAttr = new BufferAttribute(magnitudes, 1);
  const clusterAttr = new BufferAttribute(clusters, 1);
  const sinkAttr = new BufferAttribute(sinks, 1);
  const lonLatAttr = new BufferAttribute(lonLats, 2);
  const focusAttr = new BufferAttribute(focuses, 1);
  positionAttr.setUsage(35048 /* DynamicDrawUsage */);
  magAttr.setUsage(35048);
  clusterAttr.setUsage(35048);
  sinkAttr.setUsage(35048);
  lonLatAttr.setUsage(35048);
  focusAttr.setUsage(35048);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aMag", magAttr);
  geometry.setAttribute("aCluster", clusterAttr);
  geometry.setAttribute("aSink", sinkAttr);
  geometry.setAttribute("aLonLat", lonLatAttr);
  geometry.setAttribute("aFocus", focusAttr);
  geometry.setDrawRange(0, 0);
  // Never computed. The default pass walks every vertex, and the draw range changes every filter tick.
  geometry.boundingSphere = null;

  let texture = rampTexture(ramp);

  const material = new ShaderMaterial({
    ...SHADER,
    uniforms: {
      uRamp: { value: texture },
      uPixelRatio: { value: 1 },
      uBase: { value: RADIUS_BASE },
      uScale: { value: RADIUS_SCALE },
      uExp: { value: RADIUS_EXPONENT },
      uSize: { value: 1 },
      uMagMin: { value: MAG_MIN },
      uOpacity: { value: 1 },
      // 0 draws every event on the surface shell, 1 puts it at its own depth.
      uSink: { value: 0 },
      uFocusing: { value: 0 },
      // The scene's, not a copy: markers have to flatten with the geography under them.
      uMorph: morph,
    },
    transparent: true,
    depthWrite: false,
    /*
     * Not depth-tested, or markers get sliced flat near the limb.
     *
     * A point sprite is a screen-aligned square carrying one depth, its centre's. The sphere behind it
     * curves away, so pixels a few across sit in front of ocean nearer the camera, fail the test, and
     * leave a straight edge through the dot. The `vFacing` discard already hides the far side.
     */
    depthTest: false,
    /*
     * Normal blending, never additive.
     *
     * Twenty events stacked in the Flores Sea summed past the top of the ramp and clipped to white,
     * which is the chrome colour: the densest data drew itself as interface. No opacity fixes that,
     * it only moves the density where it breaks. Density is the clustering step's job.
     */
    blending: NormalBlending,
  });

  const object = new Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 5;

  return {
    object,
    setRamp: (name) => {
      texture.dispose();
      texture = rampTexture(name);
      material.uniforms["uRamp"]!.value = texture;
    },
    /** 0 shows every marker, 1 holds only the focused hour. Eased by the frame loop. */
    setFocusFade: (value) => {
      material.uniforms["uFocusing"]!.value = value;
    },
    setPixelRatio: (ratio) => {
      material.uniforms["uPixelRatio"]!.value = ratio;
    },
    setGlobeRadius: (px) => {
      // Floored at 0.45. Below that an M2 disappears, and an invisible event is worse than a fat one.
      material.uniforms["uSize"]!.value = Math.max(0.45, Math.min(1, px / REFERENCE_RADIUS_PX));
    },
    setDepthSink: (value) => {
      material.uniforms["uSink"]!.value = Math.max(0, Math.min(1, value));
    },

    sync: (store, filters, now, zoom = 3, revealUntil, focus = null) => {
      const cell = cellSizeDeg(zoom);
      /*
       * Answered on the CPU, per marker, not from an attribute. A cluster stands for events that do
       * not share an hour, so only the code holding the members can say whether one is in the hour.
       */
      const focusing = focus !== null && focus !== undefined;
      const focusLo = focusing ? focus.from : 0;
      const focusHi = focusing ? focus.to : 0;
      cellFor.clear();
      let n = 0;

      store.forEach((quake) => {
        if (n >= capacity) return;
        if (!matches(quake, filters, now)) return;

        const r = quake.primary;
        if (revealUntil !== undefined && r.time > revealUntil) return;

        /*
         * One marker per cell, carrying the largest event in it. The fill still has to mean a
         * magnitude, and the biggest thing behind it is the only one it can honestly claim.
         */
        if (cell > 0) {
          const key = cellKey(r.lon, r.lat, cell);
          const at = cellFor.get(key);
          if (at !== undefined) {
            clusters[at] = 1;
            // Any member in the hour lights the whole cell. The marker stands for all of them.
            if (focusing && r.time >= focusLo && r.time < focusHi) focuses[at] = 1;
            // The cluster takes the largest event's depth with its magnitude. An average would draw a
            // hole belonging to no earthquake in the cell.
            if (r.magnitude > magnitudes[at]!) {
              magnitudes[at] = r.magnitude;
              sinks[at] = sinkFraction(r.depthKm);
            }
            return;
          }
          cellFor.set(key, n);
        }
        clusters[n] = 0;
        focuses[n] = focusing && r.time >= focusLo && r.time < focusHi ? 1 : 0;
        // Nothing but numbers goes in this loop. An earlier version stored each event's key in a
        // parallel string array, and that one pointer store per event cost 40% of the 50k budget: a
        // reference write is a store plus a garbage-collector write barrier. Same reason toVec3 is
        // inlined here rather than called - it returns a fresh array fifty thousand times.
        const phi = r.lat * DEG;
        const lam = r.lon * DEG;
        const c = Math.cos(phi) * RADIUS_EVENTS;
        const i = n * 3;
        positions[i] = c * Math.sin(lam);
        positions[i + 1] = Math.sin(phi) * RADIUS_EVENTS;
        positions[i + 2] = c * Math.cos(lam);
        lonLats[n * 2] = r.lon;
        lonLats[n * 2 + 1] = r.lat;
        magnitudes[n] = r.magnitude;
        // A missing depth draws shallow. Both feeds leave it out sometimes, neither choice is neutral,
        // and shallow is far more common. The detail panel still says "not given".
        sinks[n] = sinkFraction(r.depthKm);
        n += 1;
      });

      geometry.setDrawRange(0, n);
      clusterAttr.updateRanges = [{ start: 0, count: n }];
      clusterAttr.needsUpdate = true;
      sinkAttr.updateRanges = [{ start: 0, count: n }];
      sinkAttr.needsUpdate = true;
      lonLatAttr.updateRanges = [{ start: 0, count: n * 2 }];
      lonLatAttr.needsUpdate = true;
      focusAttr.updateRanges = [{ start: 0, count: n }];
      focusAttr.needsUpdate = true;
      // Only the written span is uploaded. Handing the driver all 50k floats to redraw 200 markers is
      // the difference between a slider that answers and one that stutters.
      positionAttr.updateRanges = [{ start: 0, count: n * 3 }];
      magAttr.updateRanges = [{ start: 0, count: n }];
      positionAttr.needsUpdate = true;
      magAttr.needsUpdate = true;
      return n;
    },

    dispose: () => {
      cellFor.clear();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

