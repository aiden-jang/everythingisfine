import { BufferAttribute, BufferGeometry, LineSegments, NormalBlending, ShaderMaterial } from "three";
import { DEG, EARTH_RADIUS_KM } from "../geo/sphere";
import { PLAYBACK, P_WAVE_KM_PER_S, S_OVER_P } from "../geo/waves";
import { MAG_MIN, rampTexture, type RampName } from "./ramp";
import { MORPH_GLSL } from "./morph";

/*
 * The signature: a wavefront leaving the epicentre.
 *
 * Two seismic feeds have no origin and destination, so a line drawn between two earthquakes asserts a
 * relationship that does not exist. A ring asserts something true: this happened here, and the energy has
 * reached this far.
 */

/** Degrees of arc the front covers per real second. Derived, never typed in: writing 0.054 directly is how
 * it survives a change to either input without anyone noticing. */
export const TRUE_RATE_DEG_PER_S = (P_WAVE_KM_PER_S / EARTH_RADIUS_KM) / DEG;

export const RATE_DEG_PER_S = TRUE_RATE_DEG_PER_S * PLAYBACK;

// Re-exported, not redefined: `rings.test.ts` and the layer both read them and there is one source.
export { PLAYBACK, P_WAVE_KM_PER_S, S_OVER_P } from "../geo/waves";

/** Where the front fades out. Roughly 1900km of real ground, and about 15.7 seconds on screen. */
export const MAX_DEG = 17;

/**
 * Both fronts end together, when the P front reaches `MAX_DEG`. The S front is still travelling, and cutting
 * it short is deliberate: a lone circle expanding with nothing to be the second half of reads as a new
 * earthquake rather than as the tail of an old one.
 */
export const S_MAX_DEG = MAX_DEG * S_OVER_P;

export const RING_LIFETIME_S = MAX_DEG / RATE_DEG_PER_S;

/** Concurrent rings. Global seismicity above the reporting threshold never approaches this. */
const MAX_RINGS = 64;
/** Segments per ring. Below about 64 the circle reads as a polygon at high zoom. */
const SEGMENTS = 96;
const RADIUS = 1.007;

const SHADER = {
  vertexShader: /* glsl */ `
    ${MORPH_GLSL}
    attribute float aRamp;
    attribute float aFade;
    varying float vRamp;
    varying float vFade;
    varying float vFacing;

    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vRamp = aRamp;
      vFade = aFade;
      // Interpolated across the segment, so a ring straddling the horizon is clipped exactly at the limb
      // rather than vanishing or showing through the planet all at once. A map has no limb to clip at.
      vFacing = mix(dot(normalize(world.xyz), normalize(cameraPosition - world.xyz)), 1.0, uMorph);
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position), 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uRamp;
    uniform float uDim;
    varying float vRamp;
    varying float vFade;
    varying float vFacing;

    void main() {
      if (vFacing <= 0.0 || vFade <= 0.0) discard;
      gl_FragColor = vec4(texture2D(uRamp, vec2(vRamp, 0.5)).rgb, uDim * vFade * smoothstep(0.0, 0.2, vFacing));
    }`,
};

interface Ring {
  lon: number;
  lat: number;
  ramp: number;
  /** Seconds since the front left the epicentre, in playback time. */
  age: number;
}

export interface RingLayer {
  object: LineSegments;
  /** Starts a front at an epicentre. Ignored once MAX_RINGS are already running. */
  spawn: (lon: number, lat: number, magnitude: number) => void;
  /** Advances every front and rewrites the buffer. Returns how many are still alive. */
  step: (dt: number) => number;
  active: () => number;
  setRamp: (name: RampName) => void;
  /**
   * Pulls the fronts back while an hour is held on the activity strip. Without it, holding an hour five hours
   * old left the brightest things on screen belonging to the current one.
   */
  setDim: (dim: number) => void;
  dispose: () => void;
}

export function createRingLayer(ramp: RampName = "thermal", morph = { value: 0 }): RingLayer {
  const rings: Ring[] = [];

  // Two circles per front, so twice the room. A buffer sized for one and asked for two silently draws half
  // the fronts.
  const vertexCount = MAX_RINGS * SEGMENTS * 2 * 2;
  const positions = new Float32Array(vertexCount * 3);
  const ramps = new Float32Array(vertexCount);
  const fades = new Float32Array(vertexCount);
  const lonLats = new Float32Array(vertexCount * 2);

  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const rampAttr = new BufferAttribute(ramps, 1);
  const fadeAttr = new BufferAttribute(fades, 1);
  const lonLatAttr = new BufferAttribute(lonLats, 2);
  for (const a of [posAttr, rampAttr, fadeAttr, lonLatAttr]) a.setUsage(35048 /* DynamicDrawUsage */);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aRamp", rampAttr);
  geometry.setAttribute("aFade", fadeAttr);
  geometry.setAttribute("aLonLat", lonLatAttr);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = null;

  let texture = rampTexture(ramp);
  const material = new ShaderMaterial({
    ...SHADER,
    uniforms: { uRamp: { value: texture }, uDim: { value: 1 }, uMorph: morph },
    transparent: true,
    depthWrite: false,
    // Like the markers: the fronts carry their own facing test, so depth-testing them against the globe can
    // only clip them where the sphere curves past their own depth.
    depthTest: false,
    blending: NormalBlending,
  });

  const object = new LineSegments(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 6;

  // Scratch, reused across frames. Allocating a basis per ring per frame is the same mistake the event
  // layer's inlined projection exists to avoid.
  const cx = new Float32Array(3);
  const ux = new Float32Array(3);
  const vx = new Float32Array(3);

  /**
   * Writes one circle of angular radius `theta` about a point on the sphere. A circle on a sphere needs two
   * vectors perpendicular to the centre to sweep between, and building that basis from the north pole fails
   * when the epicentre is the pole - so the fallback axis comes from the centre's smallest component.
   */
  const writeCircle = (
    at: number, lon: number, lat: number, theta: number, rampAt: number, fade: number,
  ): void => {
    const phi = lat * DEG;
    const lam = lon * DEG;
    const c = Math.cos(phi);
    cx[0] = c * Math.sin(lam);
    cx[1] = Math.sin(phi);
    cx[2] = c * Math.cos(lam);

    // Any axis not parallel to the centre. Choosing the smallest component guarantees that.
    const ax = Math.abs(cx[0]!) < 0.9 ? 0 : 1;
    ux[0] = ax === 0 ? 1 : 0;
    ux[1] = ax === 0 ? 0 : 1;
    ux[2] = 0;

    // u = normalize(u - c * (c . u)), then v = c x u.
    const d = cx[0]! * ux[0]! + cx[1]! * ux[1]! + cx[2]! * ux[2]!;
    ux[0] = ux[0]! - cx[0]! * d;
    ux[1] = ux[1]! - cx[1]! * d;
    ux[2] = ux[2]! - cx[2]! * d;
    const ul = Math.hypot(ux[0]!, ux[1]!, ux[2]!) || 1;
    ux[0] = ux[0]! / ul;
    ux[1] = ux[1]! / ul;
    ux[2] = ux[2]! / ul;
    vx[0] = cx[1]! * ux[2]! - cx[2]! * ux[1]!;
    vx[1] = cx[2]! * ux[0]! - cx[0]! * ux[2]!;
    vx[2] = cx[0]! * ux[1]! - cx[1]! * ux[0]!;

    const ct = Math.cos(theta) * RADIUS;
    const st = Math.sin(theta) * RADIUS;

    let w = at;
    for (let s = 0; s < SEGMENTS; s += 1) {
      // Written as segment pairs, so the loop closes without a separate index buffer.
      for (const step of [s, s + 1]) {
        const a = (step / SEGMENTS) * Math.PI * 2;
        const ca = Math.cos(a) * st;
        const sa = Math.sin(a) * st;
        const px = cx[0]! * ct + ux[0]! * ca + vx[0]! * sa;
        const py = cx[1]! * ct + ux[1]! * ca + vx[1]! * sa;
        const pz = cx[2]! * ct + ux[2]! * ca + vx[2]! * sa;
        positions[w * 3] = px;
        positions[w * 3 + 1] = py;
        positions[w * 3 + 2] = pz;
        /*
         * Derived here rather than carried, because a front has no source coordinates. Safe for the same
         * reason the sphere shells are: the wrap only bites where a primitive interpolates across it, and a
         * front crossing the date line is two degenerate segments at the edge.
         */
        lonLats[w * 2] = (Math.atan2(px, pz) * 180) / Math.PI;
        lonLats[w * 2 + 1] = (Math.asin(py / (Math.hypot(px, py, pz) || 1)) * 180) / Math.PI;
        ramps[w] = rampAt;
        fades[w] = fade;
        w += 1;
      }
    }
  };

  return {
    object,
    active: () => rings.length,

    spawn: (lon, lat, magnitude) => {
      if (rings.length >= MAX_RINGS) return;
      rings.push({
        lon,
        lat,
        ramp: Math.max(0, Math.min(1, (magnitude - MAG_MIN) / 6.5)),
        age: 0,
      });
    },

    step: (dt) => {
      let written = 0;
      for (let i = rings.length - 1; i >= 0; i -= 1) {
        const ring = rings[i]!;
        ring.age += dt;
        const deg = ring.age * RATE_DEG_PER_S;
        if (deg >= MAX_DEG) {
          // Swap-remove. Splicing shifts every later ring, which matters not at all at this size and is
          // exactly the habit that does matter in the event layer.
          rings[i] = rings[rings.length - 1]!;
          rings.pop();
          continue;
        }
        // Linear fade. An eased one would make the front look like it was decelerating, and the whole point
        // of the derived rate is that it is not.
        const fade = 1 - deg / MAX_DEG;
        writeCircle(written, ring.lon, ring.lat, deg * DEG, ring.ramp, fade);
        written += SEGMENTS * 2;
        /*
         * The S front, behind it, on the same clock and fade. Lighter, which is a grouping decision rather
         * than a claim about amplitude - an S arrival is usually the larger one on a seismogram. Two circles
         * of equal weight expanding from one point read as two earthquakes in the same place.
         */
        writeCircle(
          written, ring.lon, ring.lat, deg * S_OVER_P * DEG, ring.ramp, fade * 0.7,
        );
        written += SEGMENTS * 2;
      }

      geometry.setDrawRange(0, written);
      const spans = [{ start: 0, count: written }];
      posAttr.updateRanges = [{ start: 0, count: written * 3 }];
      rampAttr.updateRanges = spans;
      fadeAttr.updateRanges = spans;
      lonLatAttr.updateRanges = [{ start: 0, count: written * 2 }];
      lonLatAttr.needsUpdate = true;
      posAttr.needsUpdate = true;
      rampAttr.needsUpdate = true;
      fadeAttr.needsUpdate = true;
      return rings.length;
    },

    setDim: (dim) => {
      material.uniforms["uDim"]!.value = dim;
    },
    setRamp: (name) => {
      texture.dispose();
      texture = rampTexture(name);
      material.uniforms["uRamp"]!.value = texture;
    },

    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
