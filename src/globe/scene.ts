import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, FrontSide, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene,
  PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from "three";
import {
  buildLand, RADIUS_ATMOSPHERE, RADIUS_GRATICULE, RADIUS_NIGHT, RADIUS_SPHERE,
  type LandGeometry,
} from "../geo/land";
import { DEG, distanceKm, graticule } from "../geo/sphere";
import { buildPlates, orderByProximity } from "../geo/plates";
import { subsolarPoint } from "../geo/sun";
import {
  attachLonLat, MAP_HALF_WIDTH, MORPH_GLSL, morphable, SPHERE_PHI_START, visibleCopies,
} from "./morph";
import { matches } from "../data/filter";
import type { Filters, SourceId } from "../data/types";
import { createControls, type Controls } from "./controls";
import { createEventLayer, type EventLayer } from "./events";
import { createRingLayer, type RingLayer } from "./rings";
import { auroraTexture, writeAurora } from "./auroraTexture";
import { createCycloneLayer } from "./cyclones";
import type { Cyclone } from "../sources/cyclones";
import type { Aurora } from "../sources/aurora";

/** Only the part of the store hit testing needs, so this file does not depend on the whole model. */
export interface HitStore {
  forEach: (fn: (quake: HitQuake) => void) => void;
}

export interface HitQuake {
  key: string;
  readings: readonly { source: SourceId }[];
  primary: { lon: number; lat: number; magnitude: number; time: number };
}

/**
 * How far from a marker's centre still counts as pointing at it.
 *
 * Generous by four pixels, because a marker for a small earthquake is under four pixels across and
 * asking someone to hit that exactly on a moving globe is asking them not to use the feature. Ties
 * go to the larger event, which is the one a person was more likely aiming at.
 */
const HIT_SLOP_PX = 4;

/**
 * How many nearest events get projected before picking a winner.
 *
 * Eight, because great-circle distance and screen distance disagree near the limb, so the closest
 * event on the sphere is not always the closest one to the pointer. Eight is more than enough to
 * contain that disagreement and small enough that the projections cost nothing.
 */
const SHORTLIST = 8;

/*
 * The globe, and nothing on it yet.
 *
 * Step 2 of PLAN.md, so there is deliberately no animation frame loop in this file. The camera is
 * placed once and the scene renders on mount and on resize. That is not a stub standing in for a
 * loop: DESIGN.md section 8 bans ambient rotation outright, so for as long as nothing is arriving
 * there is genuinely nothing to redraw, and an idle rAF burning a frame every 16ms to draw an
 * identical picture would be the first thing to cut later anyway.
 */

/*
 * The globe's own palette, raised by measurement.
 *
 * Land against ocean was **1.13:1**, which is not restraint, it is invisibility: the continents were
 * a suggestion and the coastline barely closed them. Every value here is bounded above by the
 * darkest stop of the data ramp, because chrome that is brighter than the dimmest earthquake starts
 * competing with the thing it is a backdrop for.
 *
 *   land  #1E293F   1.31:1 against ocean, still 1.57x darker than the ramp's floor
 *   coast #31405D   1.40:1 against land, and the stroke does the defining
 *
 * The stroke was raised further than the fill on purpose. Definition comes from edges, and
 * brightening a 1px line adds crispness without adding mass, where brightening the fill would put
 * a large pale shape on screen and pull the eye off the data.
 */
const COLOR_SPHERE = 0x0a101c;
/** The map's backdrop fades between these two, so both are needed as objects rather than numbers. */
const COLOR_VOID_C = new Color(0x070b14);
const COLOR_SPHERE_C = new Color(COLOR_SPHERE);
const COLOR_LAND = 0x1e293f;
const COLOR_COAST = 0x31405d;
/** The graticule keeps the old, dimmer value: it is scaffolding, and it should stay behind land. */
const COLOR_GRATICULE = 0x243149;
/*
 * Plate boundaries, brighter than the coastline.
 *
 * The first pass gave them the coastline's colour at 62% and they were nearly invisible, which
 * defeats the entire reason for adding them: a line you cannot see cannot explain the pattern of
 * dots sitting on it.
 *
 * They outrank the coastline deliberately. A coastline is orientation, it tells you where you are
 * looking. A plate boundary is the explanation, it tells you why the earthquakes are in a line. In
 * a seismic map the explanation should not be the fainter mark.
 */
const COLOR_PLATES = 0x3d4e6e;
const COLOR_RIM = new Color(0x7896be);

/** Where the camera settles. The Ring of Fire is where the data lives, so it faces the viewer. */
const FRAMING = { lon: 145, lat: 12 } as const;

const FOV = 32;
/**
 * Fraction of the smaller viewport dimension the globe occupies.
 *
 * Was 0.78, which left the subject floating in a lot of nothing. 0.86 still leaves the rim room to
 * fall off into, which is the only thing the margin was ever for.
 */
const FILL = 0.86;

/*
 * Rim light. Sits on the silhouette, encodes nothing, and is the one hue DESIGN.md 3.1 allows.
 *
 * Not a fresnel term. The obvious backside-shell fresnel peaks at the *shell's* silhouette rather
 * than the globe's, so it paints a hard-edged ring floating a little way off the planet with a dark
 * gap inside it. What is wanted is a halo that starts at the horizon and fades outward, so the
 * shader asks the only question that actually describes that: how close does this pixel's view ray
 * pass to the centre of the globe? At exactly one radius it grazes the horizon and the halo is
 * brightest; further out it decays; nearer in, the planet is in front of it anyway.
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
    varying vec3 vWorld;
    void main() {
      vec3 dir = normalize(vWorld - cameraPosition);
      // Perpendicular distance from the globe centre (the origin) to this view ray, in radii.
      float b = length(cross(dir, cameraPosition));
      float t = clamp((b - 1.0) / (uOuter - 1.0), 0.0, 1.0);
      gl_FragColor = vec4(uColor, pow(1.0 - t, 2.6) * uIntensity);
    }`,
};

export interface Globe {
  resize: () => void;
  render: () => void;
  dispose: () => void;
  controls: Controls;
  events: EventLayer;
  rings: RingLayer;
  /** Hands over an aurora grid, or null to draw no sky at all. */
  setAurora: (grid: Aurora | null) => void;
  /** Hands over the storms happening now. An empty list draws nothing. */
  setCyclones: (storms: readonly Cyclone[]) => void;
  setMorph: (t: number) => void;
  /** The entrance reveal: boundaries grow outward from the events rather than arriving with them. */
  plates: {
    orderFrom: (points: readonly { lon: number; lat: number }[]) => void;
    reveal: (t: number) => void;
  };
  /** Key of the drawn event nearest a client pixel, or null when the pointer is over nothing. */
  hitTest: (
    clientX: number, clientY: number, store: HitStore, filters: Filters, now: number,
  ) => string | null;
  stats: LandGeometry["stats"];
}

export function createGlobe(canvas: HTMLCanvasElement, capacity = 50_000): Globe {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

  /*
   * The globe never moves. The camera orbits it.
   *
   * The first pass rotated two nested groups and left the camera parked on +Z, which draws the same
   * picture and is the wrong model the moment anything has to be picked. Every question this app
   * asks is geographic: what is under the pointer, where is this event, where should the camera fly.
   * With the geometry pinned to true coordinates those are all answered in degrees; with the world
   * spinning underneath, every one of them first needs undoing by a rotation.
   */
  /*
   * One group for everything with a location, so the map can be drawn more than once.
   *
   * The atmosphere stays outside it: it is a property of looking at a ball, not a thing at a place,
   * and repeating it either side of a flat map would put a glowing edge in the middle of the ocean.
   */
  const world = new Group();
  scene.add(world);
  const spin = new Group();
  world.add(spin);

  /*
   * A plain rectangle behind the flat map, in the ocean's own colour.
   *
   * A sphere cannot tile a straight edge at the pole: its top row is a fan of triangles whose apexes
   * sit at each column's longitude, so flattened they leave a sawtooth along the top and bottom of the
   * map. Cutting the polar caps out instead would put a hole at each pole on the globe, which is worse
   * and more visible.
   *
   * The rectangle is the same colour as the ocean, so the sawtooth lands on it and disappears, and the
   * map gets a defined edge rather than fading into the void.
   */
  /*
   * Opaque, and faded by its colour rather than its alpha.
   *
   * Three.js draws every opaque object before any transparent one, and `renderOrder` only sorts
   * within each of those two lists. A transparent backdrop therefore paints *over* the geography no
   * matter how low its order, and the only reason it did not was that the ocean shell happened to
   * write depth in front of it. That is a backdrop held up by an unrelated layer's depth writes.
   *
   * Opaque puts it back in the list its order actually means something in. It cannot fade on alpha
   * there, so it fades from the void to the ocean instead, which is the same picture.
   */
  const mapBase = new Mesh(
    new PlaneGeometry(2 * MAP_HALF_WIDTH, 2),
    new MeshBasicMaterial({ color: COLOR_VOID_C }),
  );
  mapBase.position.z = -0.02;
  mapBase.renderOrder = -1;
  mapBase.visible = false;
  world.add(mapBase);

  /*
   * One uniform, shared by every layer. A morph where one thing stays behind is not a projection, it
   * is a bug wearing an animation, and sharing the object is what makes "did I wire that one up"
   * unanswerable in the wrong direction.
   */
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
   * The land fill is ordered, not depth-tested, and that is the whole fix for a problem that cost
   * an afternoon: triangulation happens in flat degrees, so a triangle spanning a continent's
   * interior chords through the sphere and the ocean pokes up through the middle of Asia. Lifting
   * the shell only works if you know the worst sag, and the worst sag measured 0.037 radii.
   *
   * Turning the depth test off removes the question. Back-facing land is still discarded, because
   * the winding survives the projection: a ring wound counter-clockwise in degrees is still
   * counter-clockwise seen from outside the sphere, so ordinary front-face culling hides the far
   * hemisphere exactly the way it hides the far half of the ocean sphere.
   *
   * The lines cannot do this. A line has no facing, so the graticule and the coastline keep their
   * depth test and let the ocean sphere occlude their far halves.
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
  const grat = new LineSegments(
    gratGeom,
    new LineBasicMaterial({ color: COLOR_GRATICULE, transparent: true, opacity: 0.38 }),
  );
  morphable(grat.material, morph);
  grat.renderOrder = 2;
  spin.add(grat);

  /*
   * Boundaries draw over the land, and that is the right way round.
   *
   * The instinct is to tuck them under the continents so the land reads as solid. That would hide
   * the Himalayan front, the San Andreas and the Anatolian faults, which are the boundaries a
   * viewer is most likely to recognise and the ones whose earthquakes are on land in the first
   * place. Over the graticule too, because these are real geography and that is scaffolding.
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
  // Hidden until the entrance reveals them. The whole point is that the dots read as scattered
  // first, which they cannot do with the explanation already on screen.
  plateGeom.setDrawRange(0, 0);
  const plateLines = new LineSegments(
    plateGeom,
    new LineBasicMaterial({ color: COLOR_PLATES, transparent: true, opacity: 0.9 }),
  );
  morphable(plateLines.material, morph);
  plateLines.renderOrder = 3;
  spin.add(plateLines);

  /*
   * The leading edge of the reveal, brighter, sharing the same geometry.
   *
   * Fading the boundaries in was correct and did not land: they are quiet chrome by design, so a
   * dim line appearing is a detail rather than a moment. A bright band travelling outward from the
   * earthquakes and settling to resting weight behind itself is the same information with the
   * revelation actually visible.
   *
   * Two draw calls over one buffer rather than a shader. The geometry is already sorted nearest-first,
   * so "the band" is just a second draw range sliding along it.
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
   * The globe was a navy disc with outlines on it: correct, unlit, and reading as a diagram of Earth
   * rather than as Earth. A terminator is the cheapest thing that fixes that, and it fixes it with a
   * fact: the sun really is overhead somewhere right now, and half the earthquakes on screen are
   * happening in the dark.
   *
   * One shell rather than a light on each layer. The land fill, the graticule, the plate boundaries
   * and the coastlines all need to dim together or the night side looks like a rendering fault, and
   * four shaders that must agree is four chances for them not to.
   *
   * Above the coastline and below the markers. An earthquake at 3am is not dimmer than one at noon,
   * so the data layers are drawn after this and are untouched by it.
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
          // Where the sun is depends on where a point is on Earth, not on where the projection has
          // decided to draw it, so the shading direction is carried rather than derived from the
          // vertex. Both forms travel: see the fragment shader for why one of them is not enough.
          //
          // Object space, not world space. Nothing above this rotates the sphere, and the one thing
          // the model matrix does carry is the sideways offset that repeats the map, which would move
          // the sun by four world units on every copy but the middle one.
          vNormal = normalize(position);
          vLonLat = aLonLat;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position), 1.0);
        }`,
      fragmentShader: /* glsl */ `
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
           * On the map the direction is rebuilt per fragment, not interpolated.
           *
           * A normal interpolated across a triangle is only right at its corners, and flattening
           * stretches these triangles: each quad splits into two that interpolate differently, so a
           * crease runs along every shared diagonal. Ninety-six columns of parallel creases read as
           * long diagonal streaks across Russia and Europe, which is what this looked like.
           *
           * Longitude and latitude interpolate exactly on the map, because the map *is* the lon/lat
           * plane, so rebuilding the direction from them per fragment has no error to accumulate.
           * That also fixes the repeated copies, whose model matrix carries an offset the sphere
           * normal was silently picking up.
           *
           * Mixed rather than switched. On the globe the interpolated normal is the exact one and the
           * rebuilt one is not, and a hard swap partway through the morph would be a visible jump.
           */
          float lam = radians(vLonLat.x);
          float phi = radians(vLonLat.y);
          float c = cos(phi);
          vec3 fromLonLat = vec3(c * sin(lam), sin(phi), c * cos(lam));
          float sun = dot(normalize(mix(normalize(vNormal), fromLonLat, uMorph)), normalize(uSun));

          /*
           * Darkens one side and lifts the other, in one pass.
           *
           * Darkening alone made the globe dimmer rather than lit: the night side receded and the day
           * side stayed exactly as flat as before, so the sphere still read as a disc with a shadow on
           * it instead of as a ball with a sun somewhere.
           *
           * The two factors are deliberately disjoint. They meet at zero across the terminator, so
           * nothing paints there at all: overlapping them puts a band of mid-grey along the edge,
           * which reads as haze on the lens rather than as dawn.
           *
           * The real terminator is not a hard edge either. Refraction and the sun's own width spread
           * civil twilight over about six degrees, and a hard line on a sphere this size looks like a
           * clipping fault rather than like nightfall.
           *
           * Wider than any of that, and deliberately. On the globe the band wraps a curve and reads as
           * one; flattened it runs almost straight across Eurasia, and a narrow ramp there was read as
           * a wedge with a corner missing rather than as evening. Twenty-three degrees of arc is four
           * times physical, and is where no single edge along it is legible as a boundary.
           *
           * Only the night side widens. The day ramp is already broad and asymmetric on purpose, and
           * the two still meet at 0.10 where both are zero, which is what keeps a band of mid-grey off
           * the terminator.
           */
          float night = smoothstep(0.10, -0.30, sun);
          float day = smoothstep(0.10, 0.55, sun);

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

          gl_FragColor = vec4(
            uDayColor * day + uAuroraColor * glow,
            night * uDepth + day * uLift + glow * 0.30
          );
        }`,
      uniforms: {
        uMorph: morph,
        uSun: { value: new Vector3(0, 0, 1) },
        // Achromatic, like every other piece of chrome: a warm daylight would put hue on the one
        // surface the data is drawn against.
        uDayColor: { value: new Color(0x9fb0cc) },
        /*
         * Deep enough to read as night, shallow enough that the geography survives it.
         *
         * 0.38 did not clear the second bar, and the measurement is the argument: land in shadow
         * against ocean in daylight came out at 1.084:1, under the 1.13 this palette already threw out
         * once as invisibility. Land against ocean is 1.31:1 by design, so at 0.38 the lighting was the
         * stronger edge of the two and the shading out-contrasted the thing it was shading.
         *
         * 0.26 brings the swing across the terminator to roughly 1.5:1. Still above 1.31, so the two
         * are nearer comparable than ordered, and going lower means a night that stops reading as
         * night. The wider ramp above is what removes the edge; this only stops the dark side
         * swallowing the coastline.
         */
        uDepth: { value: 0.26 },
        uLift: { value: 0.11 },
        uAurora: { value: aurora },
        // Off until a grid lands, so a failed or slow fetch draws nothing rather than a black sky.
        uAuroraOn: { value: 0 },
        /*
         * The one hue in this app that is not a magnitude, and it is admitted as light rather than as a
         * mark. The atmospheric rim is already blue and the day wash already pale blue, because both are
         * illumination; an aurora joins those. Every layer after this one is a mark and stays achromatic,
         * distinguished by shape, which matters most for wildfires, whose obvious orange is the ramp.
         *
         * Desaturated well below a real 557nm green, because it sits behind markers that carry meaning
         * and must not compete with them.
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

  /*
   * Storms, over the boundaries and under the markers, like the rest of the explanatory geography.
   * On `spin` rather than `world` so it travels with the map's copies. See `cyclones.ts`.
   */
  const cyclones = createCycloneLayer(morph);
  spin.add(cyclones.object);

  const sunDir = new Vector3();
  /*
   * Recomputed per minute, not per frame and not once.
   *
   * Once is wrong for a page somebody leaves open: the terminator would freeze at the moment they
   * opened it while the earthquakes kept arriving, which is a stale claim about the world sitting
   * next to a live one. Per frame is pointless, since the edge moves a quarter of a degree a minute.
   */
  let sunMinute = -1;
  const aimSun = (at: number): void => {
    const { lon, lat } = subsolarPoint(at);
    const phi = lat * (Math.PI / 180);
    const lam = lon * (Math.PI / 180);
    const c = Math.cos(phi);
    sunDir.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
    (night.material as ShaderMaterial).uniforms["uSun"]!.value = sunDir;
  };

  // The shell is only a container: it has to be wider than uOuter so the falloff is not clipped by
  // its own geometry, and beyond that its radius does not affect the picture.
  const rim = new Mesh(
    new SphereGeometry(RADIUS_ATMOSPHERE, 64, 48),
    new ShaderMaterial({
      ...ATMOSPHERE,
      uniforms: {
        uColor: { value: COLOR_RIM },
        uIntensity: { value: 0.42 },
        uOuter: { value: 1.22 },
      },
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(rim);

  // Added to the scene root, not to `spin`: the globe group carries no transform, and hanging the
  // events off it would only invite someone to rotate one and not the other later.
  const events = createEventLayer(capacity, "thermal", morph);
  world.add(events.object);
  const rings = createRingLayer("thermal", morph);
  world.add(rings.object);

  /*
   * Nothing under `world` is culled against its own bounds, because its bounds are the wrong shape.
   *
   * Every layer here is projected in the vertex shader, so three.js measures the sphere the geometry
   * was built as and never the plane it draws. Flat, a layer really occupies x from -2 to 2; its
   * bounding sphere still says radius 1.3 at the group origin. Offset by a period to repeat the map,
   * that sphere leaves a narrow frustum while the triangles it describes are still on screen, and the
   * copy is thrown away before it is drawn.
   *
   * The symptom was the east half of a phone going void with its earthquakes still floating in it:
   * `events` and `rings` already set this flag, so the markers survived the cull that took the ocean,
   * the coastline and the graticule out from under them. `visibleCopies` was right and the renderer
   * was discarding what it asked for, which is why the copy arithmetic looked innocent.
   *
   * One traverse over the finished graph rather than a flag at each `add`, so the reason is written
   * once. Every layer is in place by this line, and one added below it would need the same treatment.
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
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Fit by whichever dimension is tighter. Fitting by height alone puts the globe off both
    // sides of a phone; fitting by width alone leaves it swimming on a desktop. Zoom is a
    // multiple of this, so a resize rescales the view without throwing away where you were.
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
    /** 0 is the globe, 1 is the flat map. Everything on the canvas reads the same value. */
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
     * The obvious implementation projects every drawn event to the screen and compares distances.
     * That is a matrix multiply per event per pointer move, and it needs the layer to keep a list
     * of what it drew, which turned out to cost 40% of the fifty-thousand-event update budget.
     *
     * Turning the pointer into a longitude and latitude instead makes the first pass a cheap
     * great-circle distance and no projection at all. Only a handful of nearest candidates are then
     * projected to settle it in pixels, which is the part that has to be exact because
     * foreshortening near the limb makes angles and pixels disagree.
     */
    hitTest: (clientX, clientY, store, filters, now) => {
      const under = controls.pick(clientX, clientY);
      if (!under) return null;

      const near: { key: string; lon: number; lat: number; magnitude: number }[] = [];
      let worst = Infinity;
      store.forEach((quake) => {
        if (!matches(quake as never, filters, now)) return;
        const { lon, lat, magnitude } = quake.primary;
        const km = distanceKm(under.lon, under.lat, lon, lat);
        if (near.length >= SHORTLIST && km >= worst) return;
        near.push({ key: quake.key, lon, lat, magnitude });
        near.sort((a, b) => distanceKm(under.lon, under.lat, a.lon, a.lat)
          - distanceKm(under.lon, under.lat, b.lon, b.lat));
        if (near.length > SHORTLIST) near.pop();
        const last = near[near.length - 1]!;
        worst = distanceKm(under.lon, under.lat, last.lon, last.lat);
      });

      let bestKey: string | null = null;
      let bestScore = Infinity;
      for (const candidate of near) {
        const at = controls.project(candidate.lon, candidate.lat);
        if (!at) continue;
        const d = Math.hypot(at.x - clientX, at.y - clientY);
        // Same formula and same scale as the shader. If these drift, the pointer stops agreeing
        // with the picture, which is the sort of bug people describe as "it feels off".
        const radius = (1.7 + 2.9 * Math.sqrt(Math.max(0, candidate.magnitude - 1))) * markerScale();
        if (d > radius + HIT_SLOP_PX) continue;
        // Ranked by how far *outside* the marker the pointer is, so a big marker does not win
        // simply for being big when the pointer is squarely inside a small one on top of it.
        const score = d - radius;
        if (score < bestScore) {
          bestScore = score;
          bestKey = candidate.key;
        }
      }
      return bestKey;
    },
    events,
    rings,
    setCyclones: (storms) => { cyclones.set(storms); },
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
      const minute = Math.floor(Date.now() / 60_000);
      if (minute !== sunMinute) {
        sunMinute = minute;
        aimSun(Date.now());
      }

      /*
       * The atmosphere belongs to the planet, so it leaves with it.
       *
       * It is the one layer deliberately outside the morph, being a halo rather than geography, and
       * that left it sitting at the origin on the flat map: a soft blue disc a radius wide, reading as
       * an empty sea across Russia and China. Fading it out with the morph, rather than hiding it at
       * the end, because it has to be gone before the geography is flat enough to notice it.
       */
      (rim.material as ShaderMaterial).uniforms["uIntensity"]!.value = 0.42 * (1 - morph.value);
      rim.visible = morph.value < 0.999;

      /*
       * The fill is culled on the globe and not on the map.
       *
       * Culling is what hides the far hemisphere, since the fill does not depth test. A flat map has no
       * far hemisphere, so there it only throws away whichever triangles the winding pass got wrong,
       * and it got a family of them across Asia wrong: alternately wound, every other one culled, a
       * hairline of ocean running from the Caspian to Sakhalin. None of it on the globe, where those
       * same triangles face the camera edge-on and the gap closes to nothing.
       *
       * Deciding the winding in longitude and latitude instead was the first attempt and measured
       * worse, 301 gaps against 126. Removing the mechanism beats hardening the test it depends on.
       */
      // Late, at 0.9: by then the shape is flat enough that there is no far side left to see
      // through, so the switch cannot flash, and the hairlines only exist once it is flat.
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
       * The map repeats, by drawing the world again beside itself.
       *
       * The alternative is wrapping each vertex to the copy nearest the camera in the shader, which is
       * cheaper and tears: the three corners of one triangle can land on different copies, and the
       * result is the same band across the world this projection has already produced twice from other
       * causes. A whole extra pass cannot tear, because every pass is internally consistent.
       *
       * Only the copies that intersect the view are drawn, which is two most of the time and one when
       * zoomed in. Zoomed out far enough to see the whole map at once, the neighbours are off screen
       * and this costs nothing.
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
      rings.dispose();
      cyclones.dispose();
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
