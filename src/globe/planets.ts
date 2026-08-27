import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import { planetPositions } from "../geo/planets";
import { starBrightness, starVector } from "../geo/stars";
import { COLOR_STARS } from "./starfield";
import { SKY_DISTANCE, SKY_GLSL } from "./sky";

/*
 * The planets, drawn as the brightest things in the star field.
 *
 * The catalogue made the sky a place and this is what moves in it. Scrub a week of archived days and the
 * constellations hold still while five dots walk through them, which is the observation the word planet
 * comes from and the one thing a fixed catalogue can never show.
 *
 * **Five points, rebuilt on the clock, and that is the whole difference from the star field.** The stars
 * are written once and turned by a uniform; these have to be recomputed, because they move against the
 * sky rather than with it. Five Kepler solutions a minute is nothing.
 *
 * **Drawn exactly like a star, on purpose.** Same colour, same brightness ramp, same shader - so Venus
 * takes its place at the top of a scale the sky already establishes rather than being a new kind of mark
 * with a new rule. It looks like the brightest star up there because that is what it looks like.
 *
 * **Positions go in already turned.** The star field's buffer holds sidereal-zero directions and the
 * shader rotates the whole sky; a planet's right ascension is only true for the instant it was computed,
 * so applying the same rotation to a stale position would be wrong twice. `uSpin` stays at zero here and
 * `setTime` writes directions that are already correct for the moment.
 */

/** Sirius is -1.46 and the sky's ramp tops out there, so a brighter Venus simply saturates. */
const PLANET_SIZE_BOOST = 1.35;

const PLANETS = {
  vertexShader: /* glsl */ `
    ${SKY_GLSL}
    attribute float aBright;
    uniform float uPixelRatio;
    varying float vBright;

    void main() {
      vBright = aBright;
      gl_Position = projectionMatrix * viewMatrix * vec4(skyPoint(position), 1.0);
      /*
        Slightly larger than a star of the same magnitude.

        Not a cheat: a planet is a disc rather than a point, so it twinkles less and reads as steadier and
        fatter to the eye than a star of equal brightness. This is the smallest nudge that reproduces
        that, and the brightness itself is left exactly on the star ramp.
      */
      gl_PointSize = mix(2.6, 5.4, pow(aBright, 0.5)) * ${PLANET_SIZE_BOOST.toFixed(2)} * uPixelRatio;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vBright;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float disc = smoothstep(0.5, 0.34, d);
      float alpha = mix(0.46, 1.0, pow(vBright, 0.6));
      gl_FragColor = vec4(uColor, alpha * disc * uOpacity);
    }`,
};

export interface PlanetLayer {
  object: Points;
  /** Recomputes all five for the moment on screen. Called wherever the sun is aimed. */
  setTime: (at: number) => void;
  setOpacity: (value: number) => void;
  setPixelRatio: (value: number) => void;
  dispose: () => void;
}

export function createPlanets(): PlanetLayer {
  const count = 5;
  const positions = new Float32Array(count * 3);
  const brights = new Float32Array(count);
  const geometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(positions, 3);
  const brightAttr = new BufferAttribute(brights, 1);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aBright", brightAttr);
  // Same reason as the star field: the buffer is unit vectors and the drawing is eighty units out.
  geometry.boundingSphere = null;

  const material = new ShaderMaterial({
    ...PLANETS,
    uniforms: {
      uColor: { value: COLOR_STARS },
      uOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
      // Zero and left there: these positions are already turned. See the note at the top.
      uSpin: { value: 0 },
      uDistance: { value: SKY_DISTANCE },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const object = new Points(geometry, material);
  object.frustumCulled = false;
  // With the stars, not above them: a planet is one of the dots, not an annotation on them.
  object.renderOrder = -2;

  return {
    object,
    setTime: (at) => {
      const all = planetPositions(at);
      for (let i = 0; i < count; i += 1) {
        const p = all[i]!;
        /*
         * `lon` is where the planet stands over the Earth right now, so it is already the turned
         * direction: the same thing the star shader produces after rotating a catalogue position by
         * -GMST. Feeding it through `starVector` unrotated is what keeps the two layers in one frame.
         */
        const [x, y, z] = starVector(p.lon, p.lat);
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        brights[i] = starBrightness(p.magnitude);
      }
      positionAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
    },
    setOpacity: (value) => {
      material.uniforms["uOpacity"]!.value = value;
      object.visible = value > 0.001;
    },
    setPixelRatio: (value) => {
      material.uniforms["uPixelRatio"]!.value = value;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
