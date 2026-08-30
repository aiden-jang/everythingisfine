import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, FrontSide, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene,
  PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from "three";
import {
  buildLand, RADIUS_ATMOSPHERE, RADIUS_GRATICULE, RADIUS_NIGHT, RADIUS_SPHERE,
  type LandGeometry,
} from "../geo/land";
import type { RampName } from "./ramp";
import { DEG, distanceKm, graticule } from "../geo/sphere";
import { buildPlates, orderByProximity } from "../geo/plates";
import { subsolarPoint } from "../geo/sun";
import { lunarEclipse, solarEclipse } from "../geo/eclipse";
import { gmstDeg, type FigureTable, type StarTable } from "../geo/stars";
import { createStarfield } from "./starfield";
import { createMoon } from "./moon";
import { createFigures } from "./figures";
import { createPlanets } from "./planets";
import {
  attachLonLat, MAP_HALF_WIDTH, MORPH_GLSL, morphable, SPHERE_PHI_START, visibleCopies,
} from "./morph";
import { matches } from "../data/filter";
import type { Filters, SourceId } from "../data/types";
import { createControls, type Controls } from "./controls";
import { createEventLayer, type EventLayer, markerRadiusPx, sinkFraction } from "./events";
import { createRingLayer, type RingLayer } from "./rings";
import { createSlabLayer } from "./slab";
import type { SlabPoint } from "../geo/slab";
import { auroraTexture, writeAurora } from "./auroraTexture";
import { createMarkLayer, pickMark, type Mark } from "./marks";
import type { Aurora } from "../sources/aurora";

/** Only the part of the store hit testing needs, so this file does not depend on the whole model. */
export interface HitStore {
  forEach: (fn: (quake: HitQuake) => void) => void;
}

export interface HitQuake {
  key: string;
  readings: readonly { source: SourceId }[];
  /** `depthKm` is here because markers are drawn at their depth, so picking has to know it too. */
  primary: { lon: number; lat: number; magnitude: number; time: number; depthKm: number };
}

/**
 * How far from a marker's centre still counts as pointing at it. Generous by four pixels, because a small
 * earthquake's marker is under four pixels across. Ties go to the larger event.
 */
const HIT_SLOP_PX = 4;
/*
 * How far outside a mark's anchor a pointer still counts.
 *
 * Marks are outlines rather than filled discs, so requiring the pointer to land on a stroke would make
 * them feel broken.
 */
const MARK_SLOP_PX = 18;

/**
 * How many nearest events get projected before picking a winner. Great-circle distance and screen distance
 * disagree near the limb, so the closest event on the sphere is not always closest to the pointer.
 */
const SHORTLIST = 8;

/*
 * The globe's own palette.
 *
 * Every value stays below the darkest stop of the data ramp: chrome brighter than the dimmest earthquake
 * competes with what it is a backdrop for. Raise the stroke further than the fill - definition comes from
 * edges, and a brighter fill just puts a large pale shape on screen.
 *
 * These are canvas, so the chroma ceiling of 55 does not apply and they run to 78. `--color-coast` and
 * `--color-plate` in `index.css` must not follow: the cross-section paints text with them, and text is chrome.
 */
/*
 * The order is load-bearing: sea, land, graticule, coast, plates.
 *
 * Two ratios were tuned from bug reports and both went the counterintuitive way. Land sits 1.50 above sea,
 * not 1.31: an interior that reads as ocean makes every line crossing it read as a crack, and Eurasia has no
 * coastline in view to rescue it. Plates sit 2.52 above land, not 3.21: brighter, the closed boundaries
 * across Asia read as cracks in the fill.
 *
 * Re-pick `NEUTRAL` below, never scale it. Scaling the blue palette's chroma puts the coastline 9.7 dE from
 * cividis's second stop, and under about 12 two colours stop separating.
 */
const COLOR_SPHERE = 0x031120;
/*
 * Kept equal to `--color-void` by hand: two copies of one decision. The palette pass moved the CSS one
 * first, which left the canvas fading to a ground the page no longer painted.
 */
const COLOR_VOID_C = new Color(0x050b16);
const COLOR_SPHERE_C = new Color(COLOR_SPHERE);
const COLOR_LAND = 0x153456;
const COLOR_COAST = 0x245b83;
/** The graticule stays dimmer than land: it is scaffolding, and it should stay behind it. */
const COLOR_GRATICULE = 0x13334e;
/*
 * Plate boundaries outrank the coastline, deliberately. A coastline tells you where you are looking; a
 * plate boundary tells you why the earthquakes are in a line. The explanation should not be the fainter mark.
 */
const COLOR_PLATES = 0x316a97;

/*
 * The neutral geography, for the colourblind ramp.
 *
 * The bluer palette costs the accessibility ramp something the default ramp does not pay. Holding
 * luminance kept contrast identical to a hundredth, and luminance was the wrong thing to measure alone:
 * moving toward blue moved toward the half of the wheel cividis lives in, and the plate lines fell from
 * 12.0 dE to 9.3 from its second stop. The thermal ramp is warm and loses nothing, so it keeps the blue.
 */
/*
 * These are also what `--color-coast` and `--color-plate` hold in `index.css`, so the cross-section's
 * swatches match the drawn lines. Change one and the swatch describes a line nobody is drawing.
 */
const NEUTRAL = {
  sphere: 0x0a101c, land: 0x25334e, graticule: 0x243149, coast: 0x555663, plates: 0x646478,
} as const;

/**
 * The graticule as an opaque colour: its old 38% over the ocean it is drawn on. It stopped being able to
 * fade on alpha when it moved in front of the land, so the fade moved into the colour. Computed, not
 * written down, so the two palettes cannot drift apart.
 */
const GRATICULE_ON = (palette: { sphere: number; graticule: number }): number => {
  const mix = (shift: number): number => {
    const line = (palette.graticule >> shift) & 0xff;
    const sea = (palette.sphere >> shift) & 0xff;
    return Math.round(line * 0.38 + sea * 0.62) & 0xff;
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
};
const BLUEPRINT = {
  sphere: COLOR_SPHERE, land: COLOR_LAND, graticule: COLOR_GRATICULE,
  coast: COLOR_COAST, plates: COLOR_PLATES,
} as const;
const COLOR_RIM = new Color(0x7896be);
/** Pale, and the sea's own family rather than the sun's: this is water returning light, not the light. */
const COLOR_GLINT = new Color(0xa8c4e4);

/** Where the camera settles. The Ring of Fire is where the data lives, so it faces the viewer. */
const FRAMING = { lon: 145, lat: 12 } as const;

const FOV = 32;
/** Fraction of the smaller viewport dimension the globe fills. The margin exists only to give the rim
 * somewhere to fall off into. */
const FILL = 0.86;

/*
 * Rim light. Sits on the silhouette, encodes nothing, and is the one hue DESIGN.md 3.1 allows.
 *
 * Not a fresnel term: the obvious backside-shell fresnel peaks at the shell's silhouette, not the globe's,
 * so it paints a hard ring floating off the planet with a dark gap inside. This asks how close the pixel's
 * view ray passes to the centre instead, so the halo starts at the horizon and fades outward.
 */
const ATMOSPHERE = {
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uOuter;
    uniform vec3 uSun;
    varying vec3 vWorld;
    void main() {
      vec3 dir = normalize(vWorld - cameraPosition);
      // Perpendicular distance from the globe centre (the origin) to this view ray, in radii.
      float b = length(cross(dir, cameraPosition));
      float t = clamp((b - 1.0) / (uOuter - 1.0), 0.0, 1.0);

      /*
       * Brighter where the air it stands for is in sunlight. One even ring is a lit sphere with a decal on
       * it: the atmosphere above the midnight limb glowing as hard as the one above noon.
       *
       * Intensity only. Warming the terminator toward orange would put a large non-data orange beside a
       * scale whose whole contract is that colour is the reading. Brightness is free; hue is spoken for.
       *
       * Floored, never faded out: on the night limb the halo is all that separates an unlit edge from the void.
       *
       * (No backticks in here. One of them ends the template literal.)
       */
      vec3 nearest = normalize(cameraPosition + dir * -dot(cameraPosition, dir));
      float sun = mix(0.34, 1.0, smoothstep(-0.28, 0.42, dot(nearest, uSun)));

      gl_FragColor = vec4(uColor, pow(1.0 - t, 2.6) * uIntensity * sun);
    }`,
};

const GLINT_RADIUS = 1.0015;

const GLINT = {
  vertexShader: /* glsl */ `
    ${MORPH_GLSL}
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      // Object space. The model matrix carries the sideways offset that repeats the flat map, which would
      // move the sun on every copy but one.
      vNormal = normalize(position);
      vec3 projected = fmProject(position);
      vWorld = (modelMatrix * vec4(projected, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uSun;
    uniform float uIntensity;
    uniform float uPower;
    varying vec3 vNormal;
    varying vec3 vWorld;

    void main() {
      vec3 n = normalize(vNormal);
      vec3 toEye = normalize(cameraPosition - vWorld);
      // The far hemisphere, culled the way every other layer here culls it.
      if (dot(n, toEye) <= 0.0) discard;
      /*
       * Reflect the sun about the surface normal and ask how near that lands to the eye. A wide exponent
       * on purpose: a mirror-smooth sea gives a point, and the real thing is a lobe tens of degrees across.
       *
       * (No backticks in here. One of them ends the template literal.)
       */
      float spec = pow(max(dot(reflect(-normalize(uSun), n), toEye), 0.0), uPower);
      if (spec <= 0.002) discard;
      gl_FragColor = vec4(uColor, spec * uIntensity);
    }`,
};

export interface Globe {
  resize: () => void;
  render: () => void;
  dispose: () => void;
  controls: Controls;
  events: EventLayer;
  rings: RingLayer;
  /** The deep-seismicity table, or null to draw none. Set once and left: it is not a reading that refreshes. */
  setSlab: (points: readonly SlabPoint[] | null) => void;
    /** Hands over an aurora grid, or null to draw no sky at all. */
  setAurora: (grid: Aurora | null) => void;
  /** The star table, once its own chunk has landed. The caller wakes the loop afterwards. */
  /** The moment the sun, sky and moon are drawn for. Null follows the wall clock. */
  setMoment: (at: number | null) => void;
  setStars: (table: StarTable) => void;
  setFigures: (table: FigureTable) => void;
  setFiguresOn: (on: boolean) => void;
  /** Hands over every non-earthquake mark as polylines. An empty list draws nothing. */
  setMarks: (marks: readonly Mark[]) => void;
  /** Picks the geography palette the given ramp needs. See `NEUTRAL` in this file. */
  setGeography: (ramp: RampName) => void;
  /**
   * The radius the shader is drawing a given magnitude at, in CSS pixels. The hover ring and the selection
   * bracket are HTML over the canvas, and no fixed number works: the scale also grows as the camera comes
   * in, so a ring meant to enclose a mark ends up inside one.
   */
  markerRadius: (magnitude: number) => number;
  /** The camera's zoom, so the glyphs hold their size on screen the way the markers do. */
  setMarkZoom: (zoom: number) => void;
  /** The `kind:id` under the pointer, or null: its glyph is redrawn bright over itself. */
  setMarkHover: (id: string | null) => void;
  setMorph: (t: number) => void;
  /** Surface or true depth. Held here as well as in the layer, because the hit test has to project where
   * the shader draws and cannot read a uniform. */
  setDepthSink: (on: boolean) => void;
  /** The entrance reveal: boundaries grow outward from the events rather than arriving with them. */
  plates: {
    orderFrom: (points: readonly { lon: number; lat: number }[]) => void;
    reveal: (t: number) => void;
  };
  /** Key of the drawn event nearest a client pixel, or null when the pointer is over nothing. */
  hitTest: (
    clientX: number, clientY: number, store: HitStore, filters: Filters, now: number, slopPx?: number,
  ) => string | null;
  /** The `kind:id` of the non-earthquake mark under the pointer, or null. */
  hitMark: (clientX: number, clientY: number, slopPx?: number) => string | null;
  stats: LandGeometry["stats"];
}

export function createGlobe(canvas: HTMLCanvasElement, capacity = 50_000): Globe {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

  /*
   * The globe never moves; the camera orbits it. Every question this app asks is geographic - what is under
   * the pointer, where should the camera fly - and with the geometry pinned to true coordinates those are
   * answered in degrees. Spin the world instead and every one of them needs a rotation undone first.
   */
  // One group for everything with a location, so the map can be drawn more than once. The atmosphere stays
  // outside it: repeated either side of a flat map it would put a glowing edge in the middle of the ocean.
  const world = new Group();
  scene.add(world);
  const spin = new Group();
  world.add(spin);

  /*
   * A plain rectangle behind the flat map, in the ocean's own colour.
   *
   * A sphere cannot tile a straight edge at the pole - its top row is a fan of triangles - so flattened it
   * leaves a sawtooth along the top and bottom. The rectangle swallows it and gives the map a real edge.
   */
  /*
   * Opaque, and faded by its colour rather than its alpha.
   *
   * Three.js draws every opaque object before any transparent one, and `renderOrder` sorts only within each
   * list. A transparent backdrop paints over the geography however low its order.
   */
  const mapBase = new Mesh(
    new PlaneGeometry(2 * MAP_HALF_WIDTH, 2),
    new MeshBasicMaterial({ color: COLOR_VOID_C }),
  );
  mapBase.position.z = -0.02;
  mapBase.renderOrder = -1;
  mapBase.visible = false;
  world.add(mapBase);

  // One uniform, shared by every layer. A morph where one thing stays behind is a bug wearing an animation.
  const morph = { value: 0 };

  const oceanGeom = new SphereGeometry(RADIUS_SPHERE, 96, 64, SPHERE_PHI_START);
  attachLonLat(oceanGeom);
  const ocean = new Mesh(
    oceanGeom,
    new MeshBasicMaterial({ color: COLOR_SPHERE }),
  );
  morphable(ocean.material, morph);
  ocean.renderOrder = 0;
  spin.add(ocean);

  const land = buildLand();

  /*
   * The land fill is ordered, not depth-tested. Triangulation happens in flat degrees, so a triangle
   * spanning a continent's interior chords through the sphere and the ocean pokes up through Asia. Lifting
   * the shell needs the worst sag, which measured 0.037 radii; turning the test off removes the question.
   *
   * Back-facing land is still culled, because the winding survives the projection. The lines cannot do this:
   * a line has no facing, so the graticule and the coastline keep their depth test.
   */
  const fillGeom = new BufferGeometry();
  fillGeom.setAttribute("position", new BufferAttribute(land.position, 3));
  fillGeom.setIndex(new BufferAttribute(land.index, 1));
  fillGeom.setAttribute("aLonLat", new BufferAttribute(land.lonLat, 2));
  const fill = new Mesh(fillGeom, new MeshBasicMaterial({
    color: COLOR_LAND,
    depthTest: false,
    depthWrite: false,
  }));
  morphable(fill.material, morph);
  fill.renderOrder = 1;
  spin.add(fill);

  const gratGeom = new BufferGeometry();
  const grid = graticule(15, RADIUS_GRATICULE);
  gratGeom.setAttribute("position", new BufferAttribute(grid.position, 3));
  gratGeom.setAttribute("aLonLat", new BufferAttribute(grid.lonLat, 2));
  /*
   * Opaque and drawn before the land, which is the only way it ends up behind it.
   *
   * The graticule sits at 1.003, outside the ocean shell, so its near half passes the depth test - and the
   * land fill writes no depth at all. Nothing could occlude it, so it drew over the continents: invisible at
   * the equator, a starburst across Siberia from a polar orbit.
   *
   * `renderOrder` cannot fix it, because opaque always draws before transparent. So it fades by colour,
   * pre-blended against the ocean, and `setGeography` keeps that blend in step.
   */
  const grat = new LineSegments(gratGeom, new LineBasicMaterial({
    color: GRATICULE_ON({ sphere: COLOR_SPHERE, graticule: COLOR_GRATICULE }),
  }));
  morphable(grat.material, morph);
  grat.renderOrder = 0.5;
  spin.add(grat);

  /*
   * Boundaries draw over the land. Tucking them under would hide the Himalayan front, the San Andreas and
   * the Anatolian faults - the ones a viewer is most likely to recognise, and the ones on land.
   */
  const plateGeom = new BufferGeometry();
  const plateBuilt = buildPlates();
  let plateData = plateBuilt.position;
  let plateLonLat = plateBuilt.lonLat;
  const plateAttr = new BufferAttribute(plateData, 3);
  const plateLlAttr = new BufferAttribute(plateLonLat, 2);
  plateGeom.setAttribute("position", plateAttr);
  plateGeom.setAttribute("aLonLat", plateLlAttr);
  const plateSegments = plateData.length / 6;
  // Hidden until the entrance reveals them: the dots have to read as scattered before the explanation arrives.
  plateGeom.setDrawRange(0, 0);
  const plateLines = new LineSegments(
    plateGeom,
    new LineBasicMaterial({ color: COLOR_PLATES, transparent: true, opacity: 0.9 }),
  );
  morphable(plateLines.material, morph);
  plateLines.renderOrder = 3;
  spin.add(plateLines);

  /*
   * The leading edge of the reveal, brighter, over the same buffer. The geometry is already sorted
   * nearest-first, so the band is a second draw range sliding along it - two draw calls, no shader.
   */
  const plateEdge = new LineSegments(
    plateGeom.clone(),
    new LineBasicMaterial({ color: 0x93a5c0, transparent: true, opacity: 0.95 }),
  );
  morphable(plateEdge.material, morph);
  plateEdge.renderOrder = 3;
  plateEdge.geometry.setDrawRange(0, 0);
  spin.add(plateEdge);

  const coastGeom = new BufferGeometry();
  coastGeom.setAttribute("position", new BufferAttribute(land.coast, 3));
  coastGeom.setAttribute("aLonLat", new BufferAttribute(land.coastLonLat, 2));
  const coast = new LineSegments(coastGeom, new LineBasicMaterial({ color: COLOR_COAST }));
  morphable(coast.material, morph);
  coast.renderOrder = 4;
  spin.add(coast);

  /*
   * Night, as a shell over the geography and under the data.
   *
   * One shell rather than a light on each layer: the fill, the graticule, the boundaries and the coastlines
   * have to dim together, and four shaders that must agree is four chances for them not to.
   *
   * Below the markers, because an earthquake at 3am is not dimmer than one at noon.
   */
  const aurora = auroraTexture();
  const nightGeom = new SphereGeometry(RADIUS_NIGHT, 96, 64, SPHERE_PHI_START);
  attachLonLat(nightGeom);
  const night = new Mesh(
    nightGeom,
    new ShaderMaterial({
      vertexShader: /* glsl */ `
        ${MORPH_GLSL}
        varying vec3 vNormal;
        varying vec2 vLonLat;
        void main() {
          // Object space, and the direction is carried rather than derived from the vertex: where the sun
          // is depends on where a point is on Earth, not on where the projection drew it. The model matrix
          // carries the offset that repeats the map, which would move the sun on every copy but the middle.
          vNormal = normalize(position);
          vLonLat = aLonLat;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position), 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uEclipse;
        uniform float uPenumbraAng;
        uniform float uUmbraAng;
        uniform vec3 uSun;
        uniform vec3 uDayColor;
        uniform float uDepth;
        uniform float uLift;
        uniform float uMorph;
        uniform sampler2D uAurora;
        uniform float uAuroraOn;
        uniform vec3 uAuroraColor;
        varying vec3 vNormal;
        varying vec2 vLonLat;

        void main() {
          /*
           * On the map, rebuild the direction per fragment rather than interpolating. An interpolated normal
           * is only right at the corners, and flattening stretches these triangles: each quad splits into two
           * that interpolate differently, so a crease runs along every shared diagonal and ninety-six columns
           * of them read as streaks across Russia.
           *
           * Mixed, never switched: on the globe the interpolated normal is exact, so a hard swap would jump.
           */
          float lam = radians(vLonLat.x);
          float phi = radians(vLonLat.y);
          float c = cos(phi);
          vec3 fromLonLat = vec3(c * sin(lam), sin(phi), c * cos(lam));
          float sun = dot(normalize(mix(normalize(vNormal), fromLonLat, uMorph)), normalize(uSun));

          /*
           * Darkens one side and lifts the other, in one pass. Darkening alone made the globe dimmer rather
           * than lit - still a disc with a shadow instead of a ball with a sun somewhere.
           *
           * The two factors are disjoint and meet at zero across the terminator, so nothing paints there.
           * Overlap them and a band of mid-grey reads as haze on the lens rather than as dawn.
           *
           * Twenty-three degrees of arc, four times physical. Flattened, the band runs almost straight across
           * Eurasia, and a narrow ramp there read as a wedge with a corner missing.
           */
          float night = smoothstep(0.10, -0.30, sun);
          float day = smoothstep(0.10, 0.55, sun);

          /*
            The moon's shadow, on the few days there is one. uPenumbraAng is zero otherwise, so this costs a
            compare almost always.

            The surface point's angular distance from the shadow centre decides how much sun is covered:
            nothing at the penumbra's edge, most at the middle, effectively all inside the umbra - a couple
            of hundred kilometres, about eight pixels on a globe this size.

            The umbra gets its own ramp rather than the tail of the first. The two differ by a factor of
            forty in radius, and one smoothstep across that range makes totality a smudge. An annular eclipse
            has no umbra at all: eclipse.ts hands over zero.

            Move both night and day. Dimming the day alone left the shadow grey, because a shadow that does
            not raise the night wash is a shadow the planet is not in.
          */
          float cover = 0.0;
          if (uPenumbraAng > 0.0) {
            float away = acos(clamp(dot(normalize(mix(normalize(vNormal), fromLonLat, uMorph)), uEclipse), -1.0, 1.0));
            cover = smoothstep(uPenumbraAng, uPenumbraAng * 0.08, away) * 0.88;
            if (uUmbraAng > 0.0) {
              cover = max(cover, smoothstep(uUmbraAng * 2.2, uUmbraAng, away));
            }
          }
          day *= 1.0 - cover;
          night = max(night, cover);

          /*
            The lit side is brightest facing the eye and falls off toward the limb. Without it the day wash is
            flat across the hemisphere, which draws a lit circle rather than a lit sphere.

            Take the wash away rather than adding shadow. The wash is the only thing on the lit side with any
            strength, so removing it is worth about twenty levels; adding black over an ocean already at
            2,10,18 is worth about three. Darkening something already dark is arithmetic nobody can see.

            The surface point is the normal times the shell radius, which is exact here: nothing above this
            rotates the sphere, and the model matrix only carries the offset that repeats the flat map - where
            this term is off anyway, because a plane has no limb.

            (No backticks in here. One of them ends the shader.)
          */
          vec3 toEye = normalize(cameraPosition - vNormal * ${RADIUS_NIGHT});
          float edge = (1.0 - clamp(dot(vNormal, toEye), 0.0, 1.0)) * (1.0 - uMorph);
          day *= mix(1.0, 0.32, smoothstep(0.30, 0.94, edge));

          /*
           * The aurora, in the one shader that already knows where night is.
           *
           * (No backticks in here. This is inside a template literal and one of them ends the shader,
           * which the morph module warns about in as many words and I walked into anyway.)
           *
           * Multiplied by the night factor, so it cannot appear over a daylit hemisphere. Not a
           * stylistic choice: an aurora is there in daylight and you cannot see it, and drawing it
           * anyway would be the same class of claim as a wavefront moving at a speed nothing states.
           *
           * The fract wraps longitude, because the model counts 0 to 359 east and this carries -180 to
           * 180. Rebasing the grid on the way in would have been a second place to get the seam wrong.
           *
           * The gain of 3 is measured rather than picked: an ordinary active evening peaked at 28 of 100,
           * so a third of the scale is what a lively sky actually reads, and dividing by the model's
           * nominal maximum would have drawn every real night as almost nothing.
           */
          vec2 auv = vec2(fract(vLonLat.x / 360.0), (vLonLat.y + 90.0) / 180.0);
          float glow = clamp(texture2D(uAurora, auv).r * 3.0, 0.0, 1.0) * night * uAuroraOn;

          /*
           * A quarter of a level of noise, because the alpha here is a very shallow ramp.
           *
           * This overlay fades across a whole hemisphere, so its alpha changes by less than 1/255 over tens
           * of pixels and the 8-bit framebuffer quantises it into flat steps - reported three times as
           * lines across Russia and China. It only resolves at a 2x pixel ratio, which is why every
           * screenshot taken at 1x said the fill was fine.
           *
           * Dither, not more geometry: 256 segments changed nothing, because interpolation was never it.
           */
          float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float dither = (grain - 0.5) / 255.0;
          gl_FragColor = vec4(
            uDayColor * day + uAuroraColor * glow,
            night * uDepth + day * uLift + glow * 0.30 + dither
          );
        }`,
      uniforms: {
        uMorph: morph,
        uSun: { value: new Vector3(0, 0, 1) },
        /*
         * The eclipse, as a centre and two angular radii. Zero radii means no eclipse, which is every day
         * but a handful a year, so the shader's fast path is the only one most people hit.
         */
        uEclipse: { value: new Vector3(0, 0, 1) },
        uPenumbraAng: { value: 0 },
        uUmbraAng: { value: 0 },
        // Achromatic, like every other piece of chrome. A warm daylight would put hue on the one surface
        // the data is drawn against.
        uDayColor: { value: new Color(0x9fb0cc) },
        /*
         * Deep enough to read as night, shallow enough that the geography survives it.
         *
         * At 0.38, land in shadow against ocean in daylight measured 1.084:1 - under the 1.13 this palette
         * already threw out once as invisibility - so the lighting out-contrasted the thing it was lighting.
         *
         * Only the night depth was tuned. Raising both ramps together does nothing: 0.36/0.15 and 0.46/0.20
         * render indistinguishable, because every step of night is paid back by a step of day. The day side
         * stays where it was tuned and the night falls further from it, which is where form comes from.
         */
        uDepth: { value: 0.44 },
        uLift: { value: 0.11 },
        uAurora: { value: aurora },
        // Off until a grid lands, so a failed or slow fetch draws nothing rather than a black sky.
        uAuroraOn: { value: 0 },
        /*
         * The one hue here that is not a magnitude, and it is admitted as light rather than as a mark. The
         * rim is blue and the day wash pale blue for the same reason. Every layer after this is a mark and
         * stays achromatic, which matters most for wildfires, whose obvious orange is the ramp.
         */
        uAuroraColor: { value: new Color(0x7fc9a6) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: FrontSide,
    }),
  );
  night.renderOrder = 4.5;
  spin.add(night);

  // Over the boundaries and under the markers, like the rest of the explanatory geography. On `spin`
  // rather than `world` so it travels with the map's copies.
  const marks = createMarkLayer(morph);
  spin.add(marks.object);
  spin.add(marks.highlight);
  // Kept for picking as well as drawing: the layer flattens them into buffers and forgets which was which.
  let heldMarks: readonly Mark[] = [];

  const sunDir = new Vector3();
  /** Reused, like `sunDir`: the shader holds the reference and this only ever rewrites its contents. */
  const eclipseDir = new Vector3(0, 0, 1);
  /*
   * Recomputed per minute. Once is wrong for a page left open - the terminator would freeze while the
   * earthquakes kept arriving - and per frame is pointless, since the edge moves a quarter degree a minute.
   */
  /** 0 surface, 1 hypocentre. Read by the hit test, written by the setter below. */
  let sink = 0;

  /** Whether the slab table has been handed over, so the morph fade knows there is anything to fade. */
  let slabOn = false;

  let sunMinute = -1;
  /*
   * The instant the sun, sky and moon are aimed at, or null to follow the wall clock.
   *
   * Null is not the same as passing `Date.now()` every frame: it means keep the minute throttle. Any other
   * value is an exact moment and is aimed the instant it arrives, because a scrub that lagged a minute
   * behind the marks it drags would be worse than no sun at all.
   */
  let moment: number | null = null;
  const aimSun = (at: number): void => {
    const { lon, lat } = subsolarPoint(at);
    const phi = lat * (Math.PI / 180);
    const lam = lon * (Math.PI / 180);
    const c = Math.cos(phi);
    sunDir.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
    (night.material as ShaderMaterial).uniforms["uSun"]!.value = sunDir;
    (rim.material as ShaderMaterial).uniforms["uSun"]!.value = sunDir;
    (glint.material as ShaderMaterial).uniforms["uSun"]!.value = sunDir;

    /*
     * The moon's shadow, aimed from the same instant as everything else. Tonight's shadow over an archived
     * April would be nonsense.
     *
     * Radii convert from perpendicular distances to angles here rather than in `eclipse.ts`, because the
     * geometry is naturally perpendicular and only the shader wants angles.
     */
    const shadow = solarEclipse(at);
    const nightUniforms = (night.material as ShaderMaterial).uniforms;
    if (shadow.touching) {
      eclipseDir.set(shadow.centre[0], shadow.centre[1], shadow.centre[2]);
      nightUniforms["uEclipse"]!.value = eclipseDir;
      nightUniforms["uPenumbraAng"]!.value = Math.asin(Math.min(1, shadow.penumbra));
      // Negative means annular: the cone closed before it landed, so there is no totality to draw.
      nightUniforms["uUmbraAng"]!.value = shadow.umbra > 0 ? Math.asin(Math.min(1, shadow.umbra)) : 0;
    } else {
      nightUniforms["uPenumbraAng"]!.value = 0;
      nightUniforms["uUmbraAng"]!.value = 0;
    }

    /*
     * The sky turns from the same timestamp, because the sun and the stars are one fact. Aim them apart and
     * you get Orion overhead at noon.
     */
    starfield.setTime(at, gmstDeg(at));
    // The same turn, so a line cannot separate from the star it reaches.
    figures.setSpin(gmstDeg(at));
    // The same direction that lights the Earth lights the moon, which is where its phase comes from.
    moon.setTime(at, sunDir);
    // And the Earth's own shadow, which is the same two cones as above with the bodies swapped.
    moon.setUmbral(lunarEclipse(at).umbral);
    // The planets move against the sky rather than with it, so their buffer is rewritten, not rotated.
    planets.setTime(at);
  };

  // The shell is a container. It has to be wider than uOuter so the falloff is not clipped by its own
  // geometry; beyond that its radius does not affect the picture.
  const rim = new Mesh(
    new SphereGeometry(RADIUS_ATMOSPHERE, 64, 48),
    new ShaderMaterial({
      ...ATMOSPHERE,
      uniforms: {
        uColor: { value: COLOR_RIM },
        // Lifted with the night it sits against, so the limb still reads once the edge is darker.
        uIntensity: { value: 0.55 },
        uOuter: { value: 1.22 },
        // The same vector the night side reads, handed over once. `aimSun` writes through it.
        uSun: { value: sunDir },
      },
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(rim);

  /*
   * The real sky, as points. `starfield.ts` owns the reasoning. It needs no per-frame hook: the shader places
   * every star relative to `cameraPosition`, so orbiting sweeps it without the loop knowing it exists.
   */
  const starfield = createStarfield();
  scene.add(starfield.object);

  // The moon needs no table and so needs no loading: its position is six lines of trigonometry. Aimed from
  // the same clock as the sun, which is also what lights it.
  const moon = createMoon();
  scene.add(moon.object);

  // Off until asked for. The only layer up here that interprets rather than reports, so it gets a toggle
  // for the same reason the slab and the plate motions do.
  const figures = createFigures();
  scene.add(figures.object);

  // Six Kepler solutions is cheaper than fetching anything, so there is nothing to load. Rebuilt whenever
  // the sun is aimed, from the same clock.
  const planets = createPlanets();
  scene.add(planets.object);

  const glintGeom = new SphereGeometry(GLINT_RADIUS, 96, 64, SPHERE_PHI_START);
  attachLonLat(glintGeom);
  const glint = new Mesh(
    glintGeom,
    new ShaderMaterial({
      ...GLINT,
      uniforms: {
        uColor: { value: COLOR_GLINT },
        uSun: { value: sunDir },
        uIntensity: { value: 0 },
        uPower: { value: 22 },
        uMorph: morph,
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  // Above the ocean, below the land fill at 1, which is what keeps the highlight off the continents.
  glint.renderOrder = 0.75;
  spin.add(glint);

  // Added to the scene root, not to `spin`: the globe group carries no transform, and hanging the events
  // off it would invite somebody to rotate one and not the other.
  const events = createEventLayer(capacity, "thermal", morph);
  world.add(events.object);
  const rings = createRingLayer("thermal", morph);
  world.add(rings.object);
  const slab = createSlabLayer(morph);
  world.add(slab.object);

  /*
   * Nothing under `world` is culled against its own bounds, because those bounds are the wrong shape.
   *
   * Every layer is projected in the vertex shader, so three.js measures the sphere the geometry was built
   * as and never the plane it draws. Flat, a layer occupies x from -2 to 2 while its bounding sphere still
   * says radius 1.3 at the origin, so an offset copy is thrown away while its triangles are on screen.
   *
   * The symptom was the east half of a phone going void with its earthquakes still floating in it, because
   * `events` and `rings` already set this flag.
   *
   * One traverse over the finished graph, so the reason is written once. A layer added below needs the same.
   */
  world.traverse((o) => { o.frustumCulled = false; });

  const controls = createControls(camera, canvas, FRAMING, FOV);
  let markerScale = (): number => 1;

  const resize = (): void => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const { width, height } = parent.getBoundingClientRect();
    if (width < 1 || height < 1) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    // Marker sizes are in CSS pixels, so the shader needs the ratio the renderer actually used.
    events.setPixelRatio(dpr);
    slab.setPixelRatio(dpr);
    starfield.setPixelRatio(dpr);
    planets.setPixelRatio(dpr);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Fit by whichever dimension is tighter. Height alone puts the globe off both sides of a phone; width
    // alone leaves it swimming on a desktop. Zoom is a multiple of this, so a resize keeps where you were.
    const limiting = Math.min(1, camera.aspect);
    const byHeight = 1 / (FILL * Math.tan((FOV / 2) * DEG));
    const fit = byHeight / limiting;
    controls.setFit(fit, byHeight);
    // The globe's on-screen radius at the framing shot, which is what marker sizes scale against.
    const radiusPx = (height / 2) * (1 / (fit * Math.tan((FOV / 2) * DEG)));
    events.setGlobeRadius(radiusPx);
    markerScale = () => Math.max(0.45, Math.min(1, radiusPx / 300));
  };

  return {
    resize,
    controls,
    /** Swaps the geography palette. Called with the ramp rather than a palette name, because which ramp the
     * marks are drawn from is the only reason to choose. See `NEUTRAL` for the measurement. */
    markerRadius: (magnitude: number): number => markerRadiusPx(magnitude, markerScale()),
    setGeography: (ramp: RampName): void => {
      const palette = ramp === "cividis" ? NEUTRAL : BLUEPRINT;
      // The slab is geography too, and was the one layer here that did not know it.
      slab.setRamp(ramp === "cividis" ? "cividis" : "thermal");
      (ocean.material as MeshBasicMaterial).color.setHex(palette.sphere);
      (fill.material as MeshBasicMaterial).color.setHex(palette.land);
      (grat.material as LineBasicMaterial).color.setHex(GRATICULE_ON(palette));
      (plateLines.material as LineBasicMaterial).color.setHex(palette.plates);
      (coast.material as LineBasicMaterial).color.setHex(palette.coast);
      // The map's backdrop fades to the sphere colour, so it has to move with it.
      COLOR_SPHERE_C.setHex(palette.sphere);
    },
    /** 0 is the globe, 1 is the flat map. Everything on the canvas reads the same value. */
    setDepthSink: (on: boolean): void => {
      sink = on ? 1 : 0;
      events.setDepthSink(sink);
    },
    setMorph: (t: number): void => {
      morph.value = Math.max(0, Math.min(1, t));
    },
    plates: {
      /** Sorts the boundaries so the reveal grows outward from the events, then starts it hidden. */
      orderFrom: (points: readonly { lon: number; lat: number }[]): void => {
        if (points.length === 0) return;
        const ordered = orderByProximity(plateData, points, plateLonLat);
        plateData = ordered.position;
        if (ordered.lonLat) plateLonLat = ordered.lonLat;
        plateAttr.array.set(plateData);
        plateAttr.needsUpdate = true;
        plateLlAttr.array.set(plateLonLat);
        plateLlAttr.needsUpdate = true;
        const edge = plateEdge.geometry.getAttribute("position");
        (edge.array as Float32Array).set(plateData);
        edge.needsUpdate = true;
        const edgeLl = plateEdge.geometry.getAttribute("aLonLat");
        (edgeLl.array as Float32Array).set(plateLonLat);
        edgeLl.needsUpdate = true;
      },
      /** 0 hides every boundary, 1 draws all of them, with a bright band at the growing end. */
      reveal: (t: number): void => {
        const clamped = Math.max(0, Math.min(1, t));
        const drawn = Math.round(clamped * plateSegments);
        const band = clamped >= 1 ? 0 : Math.round(plateSegments * 0.12);
        const settled = Math.max(0, drawn - band);
        plateGeom.setDrawRange(0, settled * 2);
        plateEdge.geometry.setDrawRange(settled * 2, (drawn - settled) * 2);
      },
    },
    /*
     * What is under the pointer, answered geographically first and in pixels second.
     *
     * Projecting every drawn event is a matrix multiply per event per pointer move, and it needs the layer
     * to keep a list of what it drew, which measured 40% of the fifty-thousand-event budget. A longitude
     * and latitude makes the first pass a great-circle distance with no projection at all; only a handful
     * of candidates are projected to settle it, because near the limb angles and pixels disagree.
     */
    hitTest: (clientX, clientY, store, filters, now, slopPx = HIT_SLOP_PX) => {
      const under = controls.pick(clientX, clientY);
      if (!under) return null;

      const near: { key: string; lon: number; lat: number; magnitude: number; depthKm: number }[] = [];
      let worst = Infinity;
      store.forEach((quake) => {
        if (!matches(quake as never, filters, now)) return;
        const { lon, lat, magnitude, depthKm } = quake.primary;
        const km = distanceKm(under.lon, under.lat, lon, lat);
        if (near.length >= SHORTLIST && km >= worst) return;
        near.push({ key: quake.key, lon, lat, magnitude, depthKm });
        near.sort((a, b) => distanceKm(under.lon, under.lat, a.lon, a.lat)
          - distanceKm(under.lon, under.lat, b.lon, b.lat));
        if (near.length > SHORTLIST) near.pop();
        const last = near[near.length - 1]!;
        worst = distanceKm(under.lon, under.lat, last.lon, last.lat);
      });

      let bestKey: string | null = null;
      let bestScore = Infinity;
      for (const candidate of near) {
        // Projected at the depth it is drawn at, so the pointer agrees with the marker rather than with the
        // epicentre above it. Flat, the sink is off and this is the surface again.
        const at = controls.project(
          candidate.lon, candidate.lat, 1 - sinkFraction(candidate.depthKm) * sink * (1 - controls.morph()),
        );
        if (!at) continue;
        const d = Math.hypot(at.x - clientX, at.y - clientY);
        // Asked of the shader's own formula rather than copied from it. Writing the constants out twice is
        // what lets the pointer drift away from the picture.
        const radius = markerRadiusPx(candidate.magnitude, markerScale());
        if (d > radius + slopPx) continue;
        // Ranked by how far outside the marker the pointer is, so a big marker does not win simply for
        // being big when the pointer is squarely inside a small one on top of it.
        const score = d - radius;
        if (score < bestScore) {
          bestScore = score;
          bestKey = candidate.key;
        }
      }
      return bestKey;
    },
    /* Picked by their anchor, at a wider slop than the markers. See `MARK_SLOP_PX`. */
    hitMark: (clientX, clientY, slopPx = MARK_SLOP_PX) =>
      pickMark(heldMarks, { x: clientX, y: clientY }, controls.project, slopPx),
    events,
    rings,
    setMarks: (next) => { heldMarks = next; marks.set(next); },
    setMarkZoom: (zoom) => { marks.setZoom(zoom); },
    setMarkHover: (id) => { marks.setHovered(id); },
    setSlab: (points) => {
      if (points === null) {
        slab.setOpacity(0);
        return;
      }
      slab.set(points);
      slabOn = true;
      slab.setOpacity(1 - morph.value);
    },
    /*
     * Loaded from `Globe.tsx` rather than here, because the caller is the only one holding `wake`. A layer
     * that filled itself while the loop was asleep would stay invisible until something else moved.
     */
    /*
     * Which moment the sky is of.
     *
     * The scene aimed everything from `Date.now()`, so an archived day was drawn under tonight's terminator,
     * sky and moon phase. One rule decides the instant: the held cursor if there is one, otherwise `clockAt`.
     */
    setMoment: (at: number | null) => {
      moment = at;
      // Immediately, not on the next minute boundary, or a scrub drags the marks and leaves the light.
      if (at !== null) aimSun(at);
      else sunMinute = -1;
    },
    setStars: (t: StarTable) => starfield.setStars(t),
    /** The figures' table, fetched only once the reader turns the layer on. */
    setFigures: (t: FigureTable) => figures.setFigures(t),
    setFiguresOn: (on: boolean) => figures.setOn(on),
    setAurora: (grid) => {
      const material = night.material as ShaderMaterial;
      if (grid === null) {
        material.uniforms["uAuroraOn"]!.value = 0;
        return;
      }
      writeAurora(aurora, grid);
      material.uniforms["uAuroraOn"]!.value = 1;
    },
    render: () => {
      if (moment === null) {
        const minute = Math.floor(Date.now() / 60_000);
        if (minute !== sunMinute) {
          sunMinute = minute;
          aimSun(Date.now());
        }
      }

      /*
       * The atmosphere is a halo rather than geography, so it sits outside the morph - which left it at the
       * origin on the flat map as a soft blue disc reading as an empty sea across Russia. Faded out with the
       * morph rather than hidden at the end, because it has to be gone before the geography is flat.
       */
      (rim.material as ShaderMaterial).uniforms["uIntensity"]!.value = 0.42 * (1 - morph.value);
      rim.visible = morph.value < 0.999;
      /*
       * Gone by the time the map is flat. A star field around a rectangle is a view from space of a thing
       * that cannot be seen from space.
       */
      starfield.setOpacity(1 - morph.value);
      moon.setOpacity(1 - morph.value);
      figures.setOpacity(1 - morph.value);
      planets.setOpacity(1 - morph.value);
      /*
       * Gone by the time the map is flat, and not only for consistency: flattened, every point in the slab
       * collapses onto the epicentre it sits under. Depth is the only reason the layer exists.
       */
      if (slabOn) slab.setOpacity(1 - morph.value);
      /*
       * Leaves with the globe. A specular lobe depends on a surface curving away from the eye, and the plane
       * has stopped doing that.
       */
      (glint.material as ShaderMaterial).uniforms["uIntensity"]!.value = 0.55 * (1 - morph.value);
      glint.visible = morph.value < 0.999;

      /*
       * The fill is culled on the globe and not on the map.
       *
       * Culling is what hides the far hemisphere, since the fill does not depth test. A flat map has no far
       * hemisphere, so there it only throws away triangles the winding pass got wrong - a family of them
       * across Asia, leaving a hairline of ocean from the Caspian to Sakhalin.
       *
       * Deciding the winding in lon/lat instead measured worse: 301 gaps against 126.
       *
       * Switched late, at 0.9, so it cannot flash: by then there is no far side left to see through.
       */
      const wantSide = morph.value > 0.9 ? DoubleSide : FrontSide;
      const fillMaterial = fill.material as MeshBasicMaterial;
      if (fillMaterial.side !== wantSide) {
        fillMaterial.side = wantSide;
        // `side` is part of the program cache key, so three.js needs telling it changed.
        fillMaterial.needsUpdate = true;
      }

      if (morph.value < 0.01) {
        world.position.x = 0;
        mapBase.visible = false;
        renderer.render(scene, camera);
        return;
      }

      mapBase.visible = true;
      (mapBase.material as MeshBasicMaterial).color
        .copy(COLOR_VOID_C).lerp(COLOR_SPHERE_C, morph.value);

      /*
       * The map repeats by drawing the world again beside itself. Wrapping each vertex to the nearest copy
       * in the shader is cheaper and tears, because the three corners of one triangle can land on different
       * copies. A whole extra pass cannot tear.
       *
       * Only the copies that intersect the view are drawn: two most of the time, one zoomed in.
       */
      const period = 2 * MAP_HALF_WIDTH;
      const halfHeight = camera.position.z * Math.tan((FOV / 2) * (Math.PI / 180));
      const { first, last } = visibleCopies(camera.position.x, halfHeight * camera.aspect);

      renderer.autoClear = true;
      for (let k = first; k <= last; k += 1) {
        world.position.x = k * period;
        renderer.render(scene, camera);
        // Everything after the first pass paints on top of it rather than wiping it.
        renderer.autoClear = false;
      }
      renderer.autoClear = true;
      world.position.x = 0;
    },
    dispose: () => {
      events.dispose();
      slab.dispose();
      starfield.dispose();
      moon.dispose();
      figures.dispose();
      planets.dispose();
      glint.geometry.dispose();
      (glint.material as ShaderMaterial).dispose();
      rings.dispose();
      marks.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    },
    stats: land.stats,
  };
}
