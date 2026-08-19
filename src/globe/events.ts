import { BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from "three";
import type { Filters } from "../data/types";
import type { Store } from "../data/store";
import { matches } from "../data/filter";
import { DEG } from "../geo/sphere";
import { MAG_MIN, rampPosition, rampTexture, type RampName } from "./ramp";
import { cellKey, cellSizeDeg } from "./cluster";
import { MORPH_GLSL } from "./morph";

/*
 * Depth, as the one channel left.
 *
 * Hue means magnitude and radius means magnitude, so neither is available, and the two-palette rule
 * forbids inventing a second hue. What remains is shape: a shallow event is a solid disc, a deep one
 * is a ring, and everything between is a disc with a hole opening in it.
 *
 * It is worth encoding because depth changes what an earthquake *is*. Shallow events do the damage;
 * events below 300km happen inside a descending slab and are felt far more weakly for their size.
 * Along a subduction margin the depth rises with distance from the trench, so a plate diving under
 * another one now reads on the globe as solid dots at the trench giving way to rings inland. That is
 * the Wadati-Benioff zone, and it was in the data the whole time with nothing drawing it.
 */
const DEPTH_SHALLOW_KM = 70;
const DEPTH_DEEP_KM = 300;

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

/** Globe radius the sizes above were chosen against: a desktop window at the framing shot. */
const REFERENCE_RADIUS_PX = 300;

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
    ${MORPH_GLSL}
    attribute float aMag;
    attribute float aCluster;
    attribute float aDepth;
    attribute float aFocus;
    uniform float uPixelRatio;
    uniform float uBase;
    uniform float uScale;
    uniform float uSize;
    uniform float uMagMin;
    varying float vRamp;
    varying float vFacing;
    varying float vCluster;
    varying float vDepth;
    varying float vFocus;

    void main() {
      vCluster = aCluster;
      vDepth = aDepth;
      vFocus = aFocus;
      vec4 world = modelMatrix * vec4(position, 1.0);
      // The globe is a unit sphere at the origin, so the surface normal is the position itself.
      // A marker on the far side has its normal pointing away from the eye.
      vec3 normal = normalize(world.xyz);
      /*
       * A map has no far side. The facing test is what hides the other hemisphere on a globe, and
       * carried onto the plane it would delete half the earthquakes, so it fades out with the morph.
       */
      vFacing = mix(dot(normal, normalize(cameraPosition - world.xyz)), 1.0, uMorph);

      vRamp = clamp((aMag - uMagMin) / 6.5, 0.0, 1.0);
      // A collapsed marker is drawn slightly larger so its ring has somewhere to sit, but the fill
      // inside it still means exactly what every other fill means: the magnitude of an event.
      float radius = (uBase + uScale * sqrt(max(0.0, aMag - uMagMin))) * uSize + aCluster * 2.0;

      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position), 1.0);
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

      /*
       * Depth carves the centre out.
       *
       * vDepth is 0 at the surface and 1 below 300km, and the hole opens with it: a shallow event
       * stays a solid disc, a deep one becomes a ring. The outer edge never moves, because that
       * edge is the magnitude and depth is not allowed to touch it.
       *
       * (No backticks in here. This is inside a template literal, and one of them ended the shader
       * mid-comment, which typechecks as a syntax error twenty lines further down.)
       */
      if (vDepth > 0.02) {
        float hole = 0.30 * vDepth;
        alpha *= smoothstep(hole - 0.05, hole + 0.02, d);
        if (alpha <= 0.0) discard;
      }

      /*
       * Hovering an hour on the activity strip holds that hour and pushes the rest back.
       *
       * Opacity, and nothing else. Hue is magnitude, size is magnitude, the hole is depth, and this
       * is not a fourth encoding: it is a transient answer to "which of these happened then", gone
       * the moment the pointer leaves. Dimming rather than hiding is the same choice the two filter
       * tracks make, because an hour's events mean very little without the day around them.
       */
      alpha *= mix(1.0, mix(0.15, 1.0, vFocus), uFocusing);

      vec3 colour = texture2D(uRamp, vec2(vRamp, 0.5)).rgb;

      /*
       * A collapsed marker wears a chrome ring, not a bigger radius or a different hue.
       *
       * Radius already means magnitude and hue already means magnitude, so neither is available to
       * say "this stands for several". The ring is Instrument, the interface colour, which is
       * exactly right: the fill is data speaking, the ring is the interface admitting it has
       * folded something up. Without it a cluster is indistinguishable from a single event, which
       * is hiding data rather than tidying it.
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
   * Scales markers to the size of the globe on screen, not to the zoom.
   *
   * Holding a constant pixel size across zoom is right: zooming into a dense margin should separate
   * events rather than magnify them along with everything else. Holding it across *viewports* is
   * wrong, and the tweet-size test proved it. At 600px the globe is 110 pixels across and a
   * magnitude 2 marker was 9 of them, so 775 events covered the planet in overlapping discs and the
   * coastlines disappeared. The reference is the framing radius, so this changes with the window
   * and never while somebody is zooming.
   */
  setGlobeRadius: (px: number) => void;
  /**
   * Writes the visible subset into the buffers. Returns how many are drawn.
   *
   * `revealUntil` is the entrance replay: events with a later origin time are held back. It is a
   * separate argument rather than another field on `Filters`, because it is not a filter. A filter
   * is a choice the viewer made and belongs in the permalink; this is a few seconds of staging that
   * nobody should be able to share a link to.
   */
  sync: (
    store: Store, filters: Filters, now: number, zoom: number, revealUntil?: number,
    focusHour?: number | null,
  ) => number;
  dispose: () => void;
}

export function createEventLayer(
  capacity: number, ramp: RampName = "thermal", morph = { value: 0 },
): EventLayer {
  // Allocated once at full capacity and never resized. Growing a buffer means a new allocation and
  // a new GPU upload at exactly the moment the app is busiest, which is when a burst arrives.
  const positions = new Float32Array(capacity * 3);
  const magnitudes = new Float32Array(capacity);
  const clusters = new Float32Array(capacity);
  const depths = new Float32Array(capacity);
  /** Written beside the positions: the map projects from these, not from the sphere point. */
  const lonLats = new Float32Array(capacity * 2);
  /** 1 when a marker holds an event inside the hovered hour, 0 otherwise. Only read while hovering. */
  const focuses = new Float32Array(capacity);
  /** Reused between syncs. Rebuilding a Map per filter tick is the allocation the budget catches. */
  const cellFor = new Map<number, number>();

  const geometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(positions, 3);
  const magAttr = new BufferAttribute(magnitudes, 1);
  const clusterAttr = new BufferAttribute(clusters, 1);
  const depthAttr = new BufferAttribute(depths, 1);
  const lonLatAttr = new BufferAttribute(lonLats, 2);
  const focusAttr = new BufferAttribute(focuses, 1);
  positionAttr.setUsage(35048 /* DynamicDrawUsage */);
  magAttr.setUsage(35048);
  clusterAttr.setUsage(35048);
  depthAttr.setUsage(35048);
  lonLatAttr.setUsage(35048);
  focusAttr.setUsage(35048);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aMag", magAttr);
  geometry.setAttribute("aCluster", clusterAttr);
  geometry.setAttribute("aDepth", depthAttr);
  geometry.setAttribute("aLonLat", lonLatAttr);
  geometry.setAttribute("aFocus", focusAttr);
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
      uSize: { value: 1 },
      uMagMin: { value: MAG_MIN },
      uOpacity: { value: 1 },
      uFocusing: { value: 0 },
      // The scene's, not a copy: markers have to flatten with the geography under them.
      uMorph: morph,
    },
    transparent: true,
    depthWrite: false,
    /*
     * Not depth-tested. This is the fix for markers being sliced flat near the limb.
     *
     * A point sprite is rasterised as a screen-aligned square, and the whole square carries the
     * single depth of its centre vertex. The sphere behind it does not: near the limb the surface
     * curves away steeply, so pixels a few across from the marker's centre sit in front of an ocean
     * surface much nearer the camera than the marker's own depth. Those fragments fail the depth
     * test and vanish, and the survivors end where the two depths cross, which is a clean straight
     * edge through the middle of the dot.
     *
     * The far hemisphere is already handled by the `vFacing` discard in the shader, which asks the
     * right question, so the depth test was only ever adding the artefact. Same reasoning as the
     * land fill in scene.ts, arrived at from the opposite direction.
     */
    depthTest: false,
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
      // Floored at 0.45: below that a magnitude 2 stops being visible at all, and an event that
      // cannot be seen is worse than one that is slightly too large.
      material.uniforms["uSize"]!.value = Math.max(0.45, Math.min(1, px / REFERENCE_RADIUS_PX));
    },

    sync: (store, filters, now, zoom = 3, revealUntil, focusHour = null) => {
      const cell = cellSizeDeg(zoom);
      /*
       * Resolved on the CPU, per marker, rather than from an age attribute in the shader.
       *
       * A clustered marker stands for every event in its cell and those events do not share an
       * hour, so an attribute carrying the representative's age would dim a cell that genuinely
       * contains the hovered hour. The question "does this marker hold anything from that hour" can
       * only be answered where the members are still visible, which is here.
       */
      const focusing = focusHour !== null;
      const focusLo = focusing ? now - (focusHour + 1) * 3_600_000 : 0;
      const focusHi = focusing ? now - focusHour * 3_600_000 : 0;
      cellFor.clear();
      let n = 0;

      store.forEach((quake) => {
        if (n >= capacity) return;
        if (!matches(quake, filters, now)) return;

        const r = quake.primary;
        if (revealUntil !== undefined && r.time > revealUntil) return;

        /*
         * One marker per cell, carrying the largest event in it.
         *
         * The largest rather than the first or the newest, because the fill still has to mean a
         * magnitude, and the only magnitude a collapsed marker can honestly claim is the biggest
         * thing it is standing in front of. Understating it would hide the event a viewer most
         * needs to see.
         */
        if (cell > 0) {
          const key = cellKey(r.lon, r.lat, cell);
          const at = cellFor.get(key);
          if (at !== undefined) {
            clusters[at] = 1;
            // Any member inside the hour lights the whole cell. The marker is standing for all of
            // them, so it is in the hour if any of them is.
            if (focusing && r.time >= focusLo && r.time < focusHi) focuses[at] = 1;
            // The cluster keeps the largest event's magnitude, so it keeps that event's depth too.
            // Averaging would draw a hole that belongs to no earthquake in the cell.
            if (r.magnitude > magnitudes[at]!) {
              magnitudes[at] = r.magnitude;
              depths[at] = Number.isFinite(r.depthKm)
                ? Math.max(0, Math.min(1, (r.depthKm - DEPTH_SHALLOW_KM) / (DEPTH_DEEP_KM - DEPTH_SHALLOW_KM)))
                : 0;
            }
            return;
          }
          cellFor.set(key, n);
        }
        clusters[n] = 0;
        focuses[n] = focusing && r.time >= focusLo && r.time < focusHi ? 1 : 0;
        // Inlined rather than calling toVec3, which returns a fresh three-element array. At fifty
        // thousand events that is fifty thousand short-lived arrays per filter tick, and the
        // allocation dominates the trigonometry it was hiding.
        // Nothing but numbers is written in here. An earlier version also stored each event's key
        // in a parallel string array so hover could search it, and that one pointer store per event
        // cost 40% of the 50,000-event budget: a typed-array write is a store, a reference write is
        // a store plus a garbage-collector write barrier. Hit testing now works from geography
        // instead, and never touches this loop.
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
        /*
         * A missing depth reads as shallow, and that is a choice rather than an oversight.
         *
         * Depth is genuinely optional in both feeds and arrives as NaN. Drawing a ring for it would
         * claim the event was deep; drawing a solid disc claims it was shallow. Neither is neutral,
         * so the tie goes to the far more common case: the overwhelming majority of catalogued
         * earthquakes are shallow, and the detail panel still says "not given" rather than a number.
         */
        depths[n] = Number.isFinite(r.depthKm)
          ? Math.max(0, Math.min(1, (r.depthKm - DEPTH_SHALLOW_KM) / (DEPTH_DEEP_KM - DEPTH_SHALLOW_KM)))
          : 0;
        n += 1;
      });

      geometry.setDrawRange(0, n);
      clusterAttr.updateRanges = [{ start: 0, count: n }];
      clusterAttr.needsUpdate = true;
      depthAttr.updateRanges = [{ start: 0, count: n }];
      depthAttr.needsUpdate = true;
      lonLatAttr.updateRanges = [{ start: 0, count: n * 2 }];
      lonLatAttr.needsUpdate = true;
      focusAttr.updateRanges = [{ start: 0, count: n }];
      focusAttr.needsUpdate = true;
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
      cellFor.clear();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

export { rampPosition };
