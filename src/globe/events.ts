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
 *
 * **This comment used to promise more than the data delivers.** It said a plate diving under another one
 * "reads on the globe as solid dots at the trench giving way to rings inland ... the Wadati-Benioff zone".
 * The encoding does that; a typical day does not supply it. Counted: in 24 hours of M2+, **1 event of 79
 * is below 300km** - one ring on the planet - and 8 more are intermediate. At seven days it is 14 of 704
 * and a margin begins to show. The pattern is real at the right window and invisible at the default one,
 * so the legend now states the counts rather than describing a picture that is usually not there. The
 * bands moved to `data/depth.ts`, which the legend can import without dragging three.js with it.
 */
import { DEPTH_DEEP_KM, DEPTH_SHALLOW_KM } from "../data/depth";
import { EARTH_RADIUS_KM } from "../geo/sphere";

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
 * Marker radius in CSS pixels: `BASE + SCALE * (magnitude - MAG_MIN) ^ EXPONENT`.
 *
 * The compression is deliberate and the note it replaces is right about why: magnitude is already
 * logarithmic in energy, so scaling width by it directly gives a magnitude 7 that covers the country it
 * happened in. Square root was the answer to that, and it overshot. Measured on the old constants, an
 * M2 was **4.6px** and an M7 **8.8px** - under two to one across the whole scale - so the key's promise
 * that "size shows it too" was true by arithmetic and false to look at. Magnitude was carried by colour
 * alone and the globe read as a field of near-identical dots.
 *
 * 0.7 sits between area (0.5) and width (1.0), and the constants are set so the small end does not move:
 * an M2 is still 4.6px, so nothing gets noisier, while an M7 goes to **13.5px** and the range opens from
 * 1.9x to 2.9x. The drama is added at the top, where there is room for it, rather than by inflating
 * everything.
 */
const RADIUS_BASE = 1.0;
const RADIUS_SCALE = 3.6;
const RADIUS_EXPONENT = 0.7;

/**
 * The radius the shader will draw, for anything that has to agree with the picture.
 *
 * Exported because the hit test needs the same number, and it used to hold its own copy of the formula
 * with the constants written out as literals - under a comment warning that the two must not drift.
 * They would have drifted on this very change: the pointer would have kept picking at the old radius
 * while the marks were drawn at the new one.
 */
export function markerRadiusPx(magnitude: number, scale: number): number {
  const above = Math.max(0, magnitude - MAG_MIN);
  return (RADIUS_BASE + RADIUS_SCALE * Math.pow(above, RADIUS_EXPONENT)) * scale;
}

/*
 * How far below the surface an event sits, in world units, where the globe has radius 1.
 *
 * The existing `aDepth` cannot answer this. It is normalised against `DEPTH_DEEP_KM` and clamps at
 * 300km, which is right for the hole in the middle of a marker - past 300 the hole stops widening -
 * and useless as a position, because the deep events worth drawing run to 700. So depth arrives twice,
 * once as a ramp for the hole and once as a distance for the geometry, and each is derived from the
 * same field for a job the other cannot do.
 *
 * Shared with the hit test, which has to agree with the picture to within a pixel and would drift the
 * moment this was written out twice. Same reasoning as `markerRadiusPx`.
 */
export function sinkFraction(depthKm: number): number {
  /*
   * Anything outside the planet is not a reading, and reads as shallow.
   *
   * One rule for every bad value, which the first version did not have: it clamped an absurd finite
   * depth to the centre of the earth and let a non-finite one fall through to the surface, so two
   * flavours of the same nonsense landed 6371km apart. Deferring to the convention already set a
   * few lines down - a missing depth draws as shallow, because the overwhelming majority of
   * catalogued earthquakes are - means there is one answer for NaN, for a negative depth on an event
   * above sea level, and for a decimal point in the wrong place.
   */
  if (!(depthKm > 0) || depthKm > EARTH_RADIUS_KM) return 0;
  return depthKm / EARTH_RADIUS_KM;
}

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
        Derived rather than uploaded, because aSink already carries the same reading.

        aSink is depth as a fraction of the planet's radius and aDepth was that same depth normalised
        against DEPTH_DEEP_KM, so the two attributes were one scalar written twice: two array writes per
        event in the sync loop and two 50k-float uploads per frame at full zoom. The derivation only
        runs this way round - aDepth saturates at 300km and cannot produce a sink that reaches 700.

        It also settles a disagreement. A finite depth below the planet's own radius is not a reading,
        and sinkFraction called it shallow while this normalisation called it fully deep, so the same
        absurd value drew a hollow mark that did not sink. One source, one answer.
      */
      float aDepthKm = aSink * ${EARTH_RADIUS_KM.toFixed(1)};
      vDepth = clamp(
        (aDepthKm - ${DEPTH_SHALLOW_KM.toFixed(1)}) / ${(DEPTH_DEEP_KM - DEPTH_SHALLOW_KM).toFixed(1)},
        0.0, 1.0
      );
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
      float radius = (uBase + uScale * pow(max(0.0, aMag - uMagMin), uExp)) * uSize + aCluster * 2.0;

      /*
       * Sunk to the hypocentre, which is where the earthquake actually was.
       *
       * Every marker used to sit on one shell just above the surface, so depth was readable only as
       * the hole in the middle of a disc: a fact about the event rather than a place. Moved inward by
       * its own depth, the same events resolve into the slab - orbit the Kurils or Chile and the
       * scatter becomes a plane dipping under the arc, because that is the shape a subducting plate
       * makes and the catalogue has always known it.
       *
       * Added to the projected point rather than scaling position before fmProject, and that is
       * not a style choice. On the plane, radius *is* the layer index: fmProject builds its z from
       * length(sphere) - 1.0, so a marker shrunk to 0.89 would be filed a tenth of a world unit
       * under the map and drawn behind the ocean. Offsetting afterwards leaves the layer term reading
       * the surface radius it was designed around.
       *
       * It fades out with the morph because a map has no inside. Same argument as the facing test
       * above, and the reason the offset carries 1.0 - uMorph rather than being switched off.
       *
       * (No backticks in here. This is inside a template literal and one of them ends the shader.)
       */
      // position, not world: this is added to a local-space point, and the model matrix carries
      // the translation that draws the flat map more than once.
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
   * Whether markers sit on the surface or at their own depth. 0 or 1, and it eases between them.
   *
   * A uniform rather than a rewrite of fifty thousand positions, which is the whole reason depth
   * arrives as an attribute: the sink is a property of how the layer is drawn, not of the data in it.
   */
  setDepthSink: (value: number) => void;
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
    focus?: FocusSpan | null,
  ) => number;
  dispose: () => void;
}

/**
 * The slice of time the pointer is holding on the activity strip, as a span rather than an index.
 *
 * It used to take the bucket's index and multiply it by an hour. That was the same thing as the bucket
 * while a day was the only window, and wrong the moment 7d and 30d shipped: a bucket is `windowMs / 24`,
 * so at a month it is thirty hours, and every bar on the strip highlighted the same recent hour whichever
 * one the pointer was on.
 *
 * A span cannot be wrong twice. The strip knows how wide its own buckets are and this layer has no
 * business knowing, so the conversion happens once, where the width lives.
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
  // Allocated once at full capacity and never resized. Growing a buffer means a new allocation and
  // a new GPU upload at exactly the moment the app is busiest, which is when a burst arrives.
  const positions = new Float32Array(capacity * 3);
  const magnitudes = new Float32Array(capacity);
  const clusters = new Float32Array(capacity);
  /** Depth again, as a distance rather than a ramp. See `sinkFraction`. */
  const sinks = new Float32Array(capacity);
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
    setDepthSink: (value) => {
      material.uniforms["uSink"]!.value = Math.max(0, Math.min(1, value));
    },

    sync: (store, filters, now, zoom = 3, revealUntil, focus = null) => {
      const cell = cellSizeDeg(zoom);
      /*
       * Resolved on the CPU, per marker, rather than from an age attribute in the shader.
       *
       * A clustered marker stands for every event in its cell and those events do not share an
       * hour, so an attribute carrying the representative's age would dim a cell that genuinely
       * contains the hovered hour. The question "does this marker hold anything from that hour" can
       * only be answered where the members are still visible, which is here.
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
              sinks[at] = sinkFraction(r.depthKm);
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
