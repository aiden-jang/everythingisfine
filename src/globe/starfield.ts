import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from "three";
import { DEG } from "../geo/sphere";
import { starBrightness, starVector, type StarTable } from "../geo/stars";
import { SKY_DISTANCE, SKY_GLSL } from "./sky";

/* The sky, as 5,080 real stars rather than a hash of the view direction. Orion is over the Pacific in
   January and findable, which a generated field can never be. See ARCHITECTURE.md#srcglobestarfieldts. */

/** Slightly under Instrument, so a star is never as bright as a focus ring. Matches the old field. */
export const COLOR_STARS = new Color(0xc8d2e2);

/* Magnitude spent on size and on opacity together, each on its own curve. See ARCHITECTURE.md#srcglobestarfieldts. */
const SIZE_MIN_PX = 2.6;
const SIZE_MAX_PX = 5.4;
const SIZE_GAMMA = 0.5;
const ALPHA_MIN = 0.46;
const ALPHA_MAX = 1.0;
const ALPHA_GAMMA = 0.6;

const STARFIELD = {
  vertexShader: /* glsl */ `
    ${SKY_GLSL}
    attribute float aBright;
    uniform float uPixelRatio;
    varying float vBright;

    void main() {
      vBright = aBright;

      /*
        Placed by the shared sky rule: turned by sidereal time, then offset to the eye. See sky.ts.
        No backticks in here: one would end the template literal.
      */
      gl_Position = projectionMatrix * viewMatrix * vec4(skyPoint(position), 1.0);

      /*
        A fixed size in pixels, with no distance falloff. Every star is the same distance from the eye by
        construction, so attenuating would make the whole sky swell as the camera pulled back.
      */
      gl_PointSize = mix(${SIZE_MIN_PX.toFixed(2)}, ${SIZE_MAX_PX.toFixed(2)},
        pow(aBright, ${SIZE_GAMMA.toFixed(2)})) * uPixelRatio;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vBright;

    void main() {
      /*
        Round, and softened only at the very edge. A point sprite is a square, so the disc is cut out here.
        These are one to four pixels across, and a gentle gradient across a two-pixel dot removes the dot.
      */
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float disc = smoothstep(0.5, 0.34, d);

      float alpha = mix(${ALPHA_MIN.toFixed(2)}, ${ALPHA_MAX.toFixed(2)},
        pow(vBright, ${ALPHA_GAMMA.toFixed(2)}));
      gl_FragColor = vec4(uColor, alpha * disc * uOpacity);
    }`,
};

export interface Starfield {
  object: Points;
  /** Hands over the committed table once its chunk has landed. See `loadStars`. */
  setStars: (table: StarTable) => void;
  /** Turns the sky to the moment on screen. Called wherever the sun is aimed, from the same clock. */
  setTime: (at: number, gmst: number) => void;
  /** Fades with the morph to the flat map, which has no sky to be under. */
  setOpacity: (value: number) => void;
  /** Star sizes are in CSS pixels, so the shader needs the ratio the renderer actually used. */
  setPixelRatio: (value: number) => void;
  dispose: () => void;
}

export function createStarfield(): Starfield {
  const geometry = new BufferGeometry();
  /*
   * Told outright, not computed from positions that are only unit vectors. Three.js culls a Points object
   * against a bounding sphere derived from the buffer, and these describe a unit sphere at the origin while
   * the shader draws them sixty units out around a moving eye.
   */
  geometry.boundingSphere = null;

  const material = new ShaderMaterial({
    ...STARFIELD,
    uniforms: {
      uColor: { value: COLOR_STARS },
      uOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
      uSpin: { value: 0 },
      uDistance: { value: SKY_DISTANCE },
    },
    transparent: true,
    // The ocean is opaque and has already written depth, which is what hides the far side of the sky.
    depthWrite: false,
    /*
     * Additive, because a star is light arriving and not paint being laid down. Where two stars in a dense
     * part of the Milky Way land on the same pixel it is the difference between a knot brightening and a knot
     * doing nothing. It cannot wash anything out: the layer draws first and the planet is opaque in front.
     */
    blending: AdditiveBlending,
  });

  const object = new Points(geometry, material);
  object.frustumCulled = false;
  // Nothing to draw until the table arrives, and `setOpacity` must not be able to reveal an empty layer.
  object.visible = false;
  let loaded = false;
  let opacity = 1;
  // Lowest in the transparent pass: the sky is behind the night wash, the rim and every mark.
  object.renderOrder = -2;

  return {
    object,
    setStars: (table) => {
      const count = Math.floor(table.length / 3);
      const positions = new Float32Array(count * 3);
      const brights = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        const [x, y, z] = starVector(table[i * 3]!, table[i * 3 + 1]!);
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        brights[i] = starBrightness(table[i * 3 + 2]!);
      }
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("aBright", new BufferAttribute(brights, 1));
      loaded = true;
      object.visible = opacity > 0.001;
    },
    setTime: (_at, gmst) => {
      material.uniforms["uSpin"]!.value = -gmst * DEG;
    },
    setOpacity: (value) => {
      opacity = value;
      material.uniforms["uOpacity"]!.value = value;
      object.visible = loaded && value > 0.001;
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
