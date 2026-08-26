import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial,
} from "three";
import { DEG } from "../geo/sphere";
import { starBrightness, starVector, type StarTable } from "../geo/stars";

/*
 * The sky, as 5,080 real stars rather than a hash of the view direction.
 *
 * What this buys over the procedural field it replaces is recognition. Orion is over the Pacific in
 * January and the Southern Cross sits under Australia, and both are findable, which is the one thing a
 * generated field can never do however well it is tuned. It also costs less to reason about: magnitude is
 * a real number in the table instead of a density curve that had to be measured against screenshots.
 *
 * **A skybox without a skybox, and without any per-frame work.** The stars must swing when the camera
 * orbits and must not slide when it moves, which is the tell that gives a fake sky away. Rather than
 * chasing the camera from the render loop, the vertex shader adds `cameraPosition` to the star's own
 * direction, so every star sits at a fixed distance from wherever the eye is. Nothing has to be updated
 * as the camera moves, and the layer needs no hook in the loop at all.
 *
 * **Depth-tested, and that is deliberate rather than incidental.** Three.js draws every opaque object
 * before any transparent one, so a transparent layer with the test off paints over the planet no matter
 * how low its `renderOrder` sits - the trap the land fill, the markers and the old star shell are each
 * documented against. The ocean is opaque and writes depth first, and `STAR_DISTANCE` is far enough out
 * that every star in the planet's direction fails against it. That is what puts the sky behind the world.
 *
 * **Brightness only, no hue.** Real stars have real colours and this draws all of them in the interface's
 * own near-white, because hue on this globe means magnitude and section 13 leaves the atmospheric rim as
 * the only exception that will ever be made. A blue Rigel beside an orange Betelgeuse would be the second
 * thing on screen where colour meant something, and it would mean something different.
 */

/** Slightly under Instrument, so a star is never as bright as a focus ring. Matches the old field. */
export const COLOR_STARS = new Color(0xc8d2e2);

/*
 * Far enough that the planet always occludes, near enough that the camera's far plane never clips.
 *
 * The camera orbits between roughly one and four units out, the globe is a unit sphere, and the far
 * plane is at 100. The stars are placed relative to the eye, so the exact value sets no scale a viewer
 * can see, but it does have to clear the moon: at apogee the moon reaches 64 radii from the origin and so
 * up to 68 from the eye, and a star nearer than that draws in front of it. Sixty did, until there was a
 * moon to be in front of. Eighty clears it with room, and the far plane with more.
 */
const STAR_DISTANCE = 80;

/*
 * Magnitude spent on size and on opacity together, each on its own curve.
 *
 * The physical flux ratio across this table is about 1,400 to 1. Spending that on opacity alone leaves
 * Sirius alone in a black sky, and spending it on size alone gives a field of equally bright dots in
 * assorted sizes, which reads as a scatter plot. Splitting it is what makes the bright stars sit forward
 * without the faint ones dropping out.
 *
 * **Both gammas are below one, and the first attempt had them above.** The table is bottom-heavy - 4,176
 * of its 5,080 stars are fainter than magnitude 4.5 - so the normalised brightness of a typical star is
 * about 0.07, and a gamma above one crushes almost the whole catalogue onto the minimum. Measured against
 * the field this replaces: 16 lit pixels in a patch of sky where the old one had 164, with the star count
 * in that patch very nearly the same. The stars were all there and all drawn a pixel and a half wide.
 * Below one, the same 0.07 lifts to 0.31 and the faint end draws at a size a reader can actually see.
 */
const SIZE_MIN_PX = 2.6;
const SIZE_MAX_PX = 5.4;
const SIZE_GAMMA = 0.5;
const ALPHA_MIN = 0.46;
const ALPHA_MAX = 1.0;
const ALPHA_GAMMA = 0.6;

const STARFIELD = {
  vertexShader: /* glsl */ `
    attribute float aBright;
    uniform float uPixelRatio;
    uniform float uSpin;
    uniform float uDistance;
    varying float vBright;

    void main() {
      vBright = aBright;

      /*
        The sidereal turn, as a rotation about the pole.

        Positions in the buffer are unit vectors for a right ascension read straight off the catalogue,
        which is where the star stands when Greenwich sidereal time is zero. Turning the whole field by
        -GMST puts every one of them over the longitude it is actually above. One uniform, one sine and
        one cosine per vertex.

        Driven from wall-clock time, which is correct for the live view and is not the whole story: the
        scene aims the sun from Date.now() too, so an archived day is drawn under tonight's terminator and
        now under tonight's sky as well. That was already true of the sun before there was a sky to join
        it. Both should follow the moment on screen, and which instant a whole archived day means is a
        question the app has not answered yet.
      */
      float s = sin(uSpin);
      float c = cos(uSpin);
      vec3 dir = vec3(
        position.x * c + position.z * s,
        position.y,
        position.z * c - position.x * s
      );

      // Relative to the eye, so orbiting sweeps the sky and travelling never slides it.
      vec4 world = vec4(dir * uDistance + cameraPosition, 1.0);
      gl_Position = projectionMatrix * viewMatrix * world;

      /*
        A fixed size in pixels, with no distance falloff.

        Every star is the same distance from the eye by construction, so there is nothing for
        perspective to say. Attenuating anyway would make the whole sky swell as the camera pulled back,
        which is the same wallpaper tell the position maths exists to avoid.
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
        Round, and softened only at the very edge.

        A point sprite is a square, so the disc has to be cut out here. The falloff starts late on
        purpose: these are one to four pixels across, and a gentle gradient across a two-pixel dot
        removes the dot rather than softening it. Measured against the field this replaces, which had
        the same problem and solved it the same way.
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
   * Told outright, rather than computed from positions that are only unit vectors.
   *
   * Three.js frustum-culls a Points object against a bounding sphere it derives from the buffer, and
   * these positions describe a unit sphere at the origin while the shader draws them sixty units out
   * around a moving eye. Left to itself the layer vanishes the moment the camera leaves that unit
   * sphere, which is immediately. The geometry is not where the drawing is, so the culling has to go.
   */
  geometry.boundingSphere = null;

  const material = new ShaderMaterial({
    ...STARFIELD,
    uniforms: {
      uColor: { value: COLOR_STARS },
      uOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
      uSpin: { value: 0 },
      uDistance: { value: STAR_DISTANCE },
    },
    transparent: true,
    // The ocean is opaque and has already written depth, which is what hides the far side of the sky.
    depthWrite: false,
    /*
     * Additive, because a star is light arriving and not paint being laid down.
     *
     * Over the void this is nearly indistinguishable from ordinary blending, and where two stars in a
     * dense part of the Milky Way land on the same pixel it is the difference between a knot brightening
     * and a knot doing nothing. It cannot wash anything out: the layer draws first and the planet is
     * opaque in front of it.
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
