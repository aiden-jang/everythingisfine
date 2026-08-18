import { BufferAttribute, BufferGeometry, LineSegments, NormalBlending, ShaderMaterial } from "three";
import { DEG, EARTH_RADIUS_KM } from "../geo/sphere";
import { MAG_MIN, rampTexture, type RampName } from "./ramp";

/*
 * The signature: a wavefront leaving the epicentre.
 *
 * DESIGN.md 3.3 replaced arcs with these, and the reason is that two seismic feeds have no origin
 * and destination. A line drawn between two earthquakes asserts a relationship that does not exist.
 * A ring asserts something true and already known: this happened here, and the energy has reached
 * this far.
 */

/** P-wave through continental crust. The number everything else here is derived from. */
export const P_WAVE_KM_PER_S = 6;

/**
 * Degrees of arc the front covers per real second. Derived, never typed in.
 *
 * 6 km/s over a 6371km radius is 0.054 deg/s, and writing that constant directly is how it survives
 * a change to either input without anyone noticing.
 */
export const TRUE_RATE_DEG_PER_S = (P_WAVE_KM_PER_S / EARTH_RADIUS_KM) / DEG;

/**
 * Playback multiplier, printed in the rail rather than hidden.
 *
 * At true rate the front advances 0.054 deg/s, which on a 400px globe is **0.16 pixels per second**.
 * A mock built at true rate proved it reads as a still image, and an imperceptible wavefront fails
 * section 8's requirement that the first frame after load has a ring expanding. Real rate would have
 * been honest and useless at once. Stating the multiplier keeps both, which is what section 10 asks
 * of every number on screen.
 */
export const PLAYBACK = 20;

export const RATE_DEG_PER_S = TRUE_RATE_DEG_PER_S * PLAYBACK;

/** Where the front fades out. Roughly 1900km of real ground, and about 15.7 seconds on screen. */
export const MAX_DEG = 17;

export const RING_LIFETIME_S = MAX_DEG / RATE_DEG_PER_S;

/** Concurrent rings. Global seismicity above the reporting threshold never approaches this. */
const MAX_RINGS = 64;
/** Segments per ring. Below about 64 the circle reads as a polygon at high zoom. */
const SEGMENTS = 96;
const RADIUS = 1.007;

const SHADER = {
  vertexShader: /* glsl */ `
    attribute float aRamp;
    attribute float aFade;
    varying float vRamp;
    varying float vFade;
    varying float vFacing;

    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vRamp = aRamp;
      vFade = aFade;
      // Interpolated across the segment, so a ring straddling the horizon is clipped exactly at
      // the limb rather than vanishing or showing through the planet all at once.
      vFacing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
      gl_Position = projectionMatrix * viewMatrix * world;
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
   * Pulls the fronts back while an hour is held on the activity strip.
   *
   * Without it, holding an hour five hours old left the brightest things on screen, the wavefronts,
   * belonging to the current one: the whole globe faded to ghosts around three full-strength rings
   * announcing the opposite of what the pointer was asking about.
   */
  setDim: (dim: number) => void;
  dispose: () => void;
}

export function createRingLayer(ramp: RampName = "thermal"): RingLayer {
  const rings: Ring[] = [];

  const vertexCount = MAX_RINGS * SEGMENTS * 2;
  const positions = new Float32Array(vertexCount * 3);
  const ramps = new Float32Array(vertexCount);
  const fades = new Float32Array(vertexCount);

  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const rampAttr = new BufferAttribute(ramps, 1);
  const fadeAttr = new BufferAttribute(fades, 1);
  for (const a of [posAttr, rampAttr, fadeAttr]) a.setUsage(35048 /* DynamicDrawUsage */);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aRamp", rampAttr);
  geometry.setAttribute("aFade", fadeAttr);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = null;

  let texture = rampTexture(ramp);
  const material = new ShaderMaterial({
    ...SHADER,
    uniforms: { uRamp: { value: texture }, uDim: { value: 1 } },
    transparent: true,
    depthWrite: false,
    // Same as the markers: the fronts carry their own facing test, so depth-testing them against
    // the globe can only clip them where the sphere happens to curve past their own depth.
    depthTest: false,
    blending: NormalBlending,
  });

  const object = new LineSegments(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 6;

  // Scratch, reused across frames. Allocating a basis per ring per frame is the same mistake the
  // event layer's inlined projection exists to avoid.
  const cx = new Float32Array(3);
  const ux = new Float32Array(3);
  const vx = new Float32Array(3);

  /**
   * Writes one circle of angular radius `theta` about a point on the sphere.
   *
   * A circle on a sphere is not a circle in the plane: it is the set of points a fixed angle away
   * from a centre, which needs two vectors perpendicular to that centre to sweep between. Building
   * that basis from the north pole fails when the epicentre *is* the pole, so the fallback axis is
   * picked from whichever component of the centre is smallest.
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
        positions[w * 3] = cx[0]! * ct + ux[0]! * ca + vx[0]! * sa;
        positions[w * 3 + 1] = cx[1]! * ct + ux[1]! * ca + vx[1]! * sa;
        positions[w * 3 + 2] = cx[2]! * ct + ux[2]! * ca + vx[2]! * sa;
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
          // Swap-remove. Splicing shifts every later ring, which matters not at all at this size
          // and is exactly the habit that does matter in the event layer.
          rings[i] = rings[rings.length - 1]!;
          rings.pop();
          continue;
        }
        // Linear fade. An eased one would make the front look like it was decelerating, and the
        // whole point of the derived rate is that it is not.
        writeCircle(written, ring.lon, ring.lat, deg * DEG, ring.ramp, 1 - deg / MAX_DEG);
        written += SEGMENTS * 2;
      }

      geometry.setDrawRange(0, written);
      const spans = [{ start: 0, count: written }];
      posAttr.updateRanges = [{ start: 0, count: written * 3 }];
      rampAttr.updateRanges = spans;
      fadeAttr.updateRanges = spans;
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
