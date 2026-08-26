import { BufferAttribute, BufferGeometry, Color, LineSegments, ShaderMaterial } from "three";
import { starVector, type FigureTable } from "../geo/stars";
import { SKY_DISTANCE, SKY_GLSL } from "./sky";

/*
 * The constellation figures, laid over the stars they join.
 *
 * The star field is real and that only got halfway: a sky nobody can find anything in is still a
 * backdrop, and finding things in a sky means knowing which dots belong together. These are the lines
 * that make Orion into Orion.
 *
 * **The one layer here that measures nothing.** Every other thing drawn on this globe is a reading -
 * where an earthquake was, where a plate edge runs, how deep a slab goes. Nobody discovered that those
 * seven stars are a plough; somebody decided it. That is why it is a toggle rather than scenery, and it
 * sits beside the slab and the plate motions, which are the other two layers that interpret rather than
 * report.
 *
 * **Faint, and thinner than the stars are bright.** The lines exist to be followed, not looked at, so
 * they are drawn at a fraction of the star colour's weight. Any brighter and the sky becomes a star chart
 * competing with the planet, which is the thing on screen that actually matters.
 *
 * **Placed by the same rule as the stars**, from `sky.ts`, which is not a convenience: a line drawn at a
 * different distance or a different rotation than the star it points at is a line pointing at nothing.
 */

/*
 * The star colour, at the weight a guide line deserves.
 *
 * Not a colour of its own. These belong to the stars and reading as a different material would make them
 * a third thing on screen rather than an annotation on the second.
 *
 * Started at 0.2 and measured: a 360 by 110 patch of sky brightened by 0.14 of a luminance level, which
 * is present and takes hunting for. A reader who pressed a button labelled "figures" has asked to see
 * figures, so the ceiling here is what would start competing with the planet, not what is barely there.
 */
const COLOR_FIGURES = new Color(0xc8d2e2);
const FIGURE_OPACITY = 0.3;

const FIGURES = {
  vertexShader: /* glsl */ `
    ${SKY_GLSL}
    void main() {
      gl_Position = projectionMatrix * viewMatrix * vec4(skyPoint(position), 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
      gl_FragColor = vec4(uColor, uOpacity);
    }`,
};

export interface Figures {
  object: LineSegments;
  /** Hands over the committed table once its chunk has landed. */
  setFigures: (table: FigureTable) => void;
  /** The sidereal turn, shared with the star field so the two cannot separate. */
  setSpin: (gmst: number) => void;
  /** Fades with the morph to the flat map, which has no sky to draw figures on. */
  setOpacity: (value: number) => void;
  /** The reader's own choice, since this layer is an interpretation and not a reading. */
  setOn: (on: boolean) => void;
  dispose: () => void;
}

export function createFigures(): Figures {
  const geometry = new BufferGeometry();
  /*
   * The same reason the star field needs it: the positions describe a unit sphere at the origin while
   * the shader draws them eighty units out around a moving eye, so a bounding sphere derived from the
   * buffer culls the whole layer the moment the camera leaves the unit sphere, which is immediately.
   */
  geometry.boundingSphere = null;

  const material = new ShaderMaterial({
    ...FIGURES,
    uniforms: {
      uColor: { value: COLOR_FIGURES },
      uOpacity: { value: FIGURE_OPACITY },
      uSpin: { value: 0 },
      uDistance: { value: SKY_DISTANCE },
    },
    transparent: true,
    // The planet is opaque and wrote depth already, which is what hides the far half of the sky.
    depthWrite: false,
  });

  const object = new LineSegments(geometry, material);
  object.frustumCulled = false;
  object.visible = false;
  // Below the stars, so a star always sits on top of the line that reaches it.
  object.renderOrder = -2.1;

  let loaded = false;
  let on = false;
  let morph = 1;
  const show = (): void => { object.visible = loaded && on && morph > 0.001; };

  return {
    object,
    setFigures: (table) => {
      /*
       * Polylines expanded to segments here rather than in the committed file.
       *
       * A run of joined points is what a figure is, and writing it out as independent segments would
       * duplicate every interior point on the wire. `LineSegments` wants the duplicates, so they are
       * made at load: cheaper to ship, identical in the buffer.
       */
      let vertices = 0;
      for (const line of table) vertices += Math.max(0, line.length / 2 - 1) * 2;
      const positions = new Float32Array(vertices * 3);
      let at = 0;
      for (const line of table) {
        for (let i = 0; i + 3 < line.length; i += 2) {
          for (const [ra, dec] of [
            [line[i]!, line[i + 1]!], [line[i + 2]!, line[i + 3]!],
          ] as [number, number][]) {
            const [x, y, z] = starVector(ra, dec);
            positions[at] = x;
            positions[at + 1] = y;
            positions[at + 2] = z;
            at += 3;
          }
        }
      }
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      loaded = true;
      show();
    },
    setSpin: (gmst) => {
      material.uniforms["uSpin"]!.value = -gmst * (Math.PI / 180);
    },
    setOpacity: (value) => {
      morph = value;
      material.uniforms["uOpacity"]!.value = FIGURE_OPACITY * value;
      show();
    },
    setOn: (next) => {
      on = next;
      show();
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
