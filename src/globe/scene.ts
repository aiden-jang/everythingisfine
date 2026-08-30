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

export interface HitStore {
  forEach: (fn: (quake: HitQuake) => void) => void;
}

export interface HitQuake {
  key: string;
  readings: readonly { source: SourceId }[];
  primary: { lon: number; lat: number; magnitude: number; time: number; depthKm: number };
}

/* A small earthquake's marker is under 4px across, so the target needs padding to be hittable at all. */
const HIT_SLOP_PX = 4;
/* Marks are outlines, not filled discs. Asking a pointer to land on a stroke feels broken. */
const MARK_SLOP_PX = 18;

/* Nearest on the sphere is not nearest on screen near the limb, so a few candidates get projected. */
const SHORTLIST = 8;

/* The globe's palette, brightest last: sea, land, graticule, coast, plates. See ARCHITECTURE.md. */
const COLOR_SPHERE = 0x031120;
/* Must equal `--color-void` in `index.css`. Nothing checks it, and the canvas fades to this. */
const COLOR_VOID_C = new Color(0x050b16);
const COLOR_SPHERE_C = new Color(COLOR_SPHERE);
const COLOR_LAND = 0x153456;
const COLOR_COAST = 0x245b83;
const COLOR_GRATICULE = 0x13334e;
/* Brighter than the coastline on purpose: the boundary is why the earthquakes are in a line. */
const COLOR_PLATES = 0x316a97;

/* Greyer geography, for the colourblind ramp. That ramp is blue, and blue geography behind it stops being a
   separate thing you can see. Re-pick these by eye; scaling the blue ones down does not work. See
   ARCHITECTURE.md. */
const NEUTRAL = {
  sphere: 0x0a101c, land: 0x25334e, graticule: 0x243149, coast: 0x555663, plates: 0x646478,
} as const;

/* The graticule faded into its colour rather than its alpha, because it is opaque. See `grat` below. */
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
const COLOR_GLINT = new Color(0xa8c4e4);

/* The Ring of Fire faces the viewer, because that is where the earthquakes are. */
const FRAMING = { lon: 145, lat: 12 } as const;

const FOV = 32;
/** Fraction of the smaller viewport dimension the globe fills. */
const FILL = 0.86;

/*
 * The blue haze on the rim. The one hue in this app that means nothing; DESIGN.md 3.1 allows it.
 *
 * Don't rewrite it as a fresnel term. Fresnel peaks at the shell's edge, not the planet's, which draws a
 * bright ring floating off the globe with a dark gap inside it.
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
      float b = length(cross(dir, cameraPosition));
      float t = clamp((b - 1.0) / (uOuter - 1.0), 0.0, 1.0);

      /*
       * Brighter where the air is in sunlight, or the halo reads as a decal stuck on the planet. Brightness
       * only: warming it toward orange would be a big non-data orange next to a scale made of colour.
       *
       * No backticks anywhere in this shader. One of them ends the template literal holding it.
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
      // Object space: the model matrix repeats the flat map sideways and would move the sun on every copy.
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
      if (dot(n, toEye) <= 0.0) discard;
      /* A wide exponent on purpose: a mirror gives a point of light and a real sea gives a broad lobe.
         No backticks in here - one of them ends the template literal. */
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
  setSlab: (points: readonly SlabPoint[] | null) => void;
  setAurora: (grid: Aurora | null) => void;
  setMoment: (at: number | null) => void;
  setStars: (table: StarTable) => void;
  setFigures: (table: FigureTable) => void;
  setFiguresOn: (on: boolean) => void;
  setMarks: (marks: readonly Mark[]) => void;
  setGeography: (ramp: RampName) => void;
  /** Ask the shader how big it drew a marker. No fixed number works: the scale grows with zoom. */
  markerRadius: (magnitude: number) => number;
  setMarkZoom: (zoom: number) => void;
  setMarkHover: (id: string | null) => void;
  setMorph: (t: number) => void;
  /** Surface or true depth. Held here too, because the hit test cannot read a shader uniform. */
  setDepthSink: (on: boolean) => void;
  plates: {
    orderFrom: (points: readonly { lon: number; lat: number }[]) => void;
    reveal: (t: number) => void;
  };
  hitTest: (
    clientX: number, clientY: number, store: HitStore, filters: Filters, now: number, slopPx?: number,
  ) => string | null;
  hitMark: (clientX: number, clientY: number, slopPx?: number) => string | null;
  stats: LandGeometry["stats"];
}

export function createGlobe(canvas: HTMLCanvasElement, capacity = 50_000): Globe {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

  /* Don't spin the world to move the view; orbit the camera. Every question here is geographic, and a
     spun world means undoing a rotation before any of them can be answered. */
  // Everything with a location, so the flat map can be drawn more than once. Keep the atmosphere out of
  // it, or the repeats put a glowing edge through the middle of the ocean.
  const world = new Group();
  scene.add(world);
  const spin = new Group();
  world.add(spin);

  /*
   * A rectangle behind the flat map, hiding the sawtooth the sphere's pole leaves when it unwraps.
   */
  /* It has to be opaque. Three.js draws every opaque object before any transparent one and `renderOrder`
     only sorts within each group, so a transparent backdrop paints over the geography whatever you ask. */
  const mapBase = new Mesh(
    new PlaneGeometry(2 * MAP_HALF_WIDTH, 2),
    new MeshBasicMaterial({ color: COLOR_VOID_C }),
  );
  mapBase.position.z = -0.02;
  mapBase.renderOrder = -1;
  mapBase.visible = false;
  world.add(mapBase);

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
   * Land has its depth test off and is drawn in order instead. Triangles are cut in flat degrees, so one
   * spanning a continent cuts a chord through the sphere and the ocean pokes up through Asia.
   *
   * Only the fill can do this. A line has no facing to cull by, so the graticule and coast keep their test.
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
  /* Drawn before the land, which is the only way it ends up behind it: the land writes no depth, so nothing
     occludes the graticule and it drew a starburst across Siberia. See ARCHITECTURE.md. */
  const grat = new LineSegments(gratGeom, new LineBasicMaterial({
    color: GRATICULE_ON({ sphere: COLOR_SPHERE, graticule: COLOR_GRATICULE }),
  }));
  morphable(grat.material, morph);
  grat.renderOrder = 0.5;
  spin.add(grat);

  /* Over the land, not under it: the faults people recognise are the ones on land. */
  const plateGeom = new BufferGeometry();
  const plateBuilt = buildPlates();
  let plateData = plateBuilt.position;
  let plateLonLat = plateBuilt.lonLat;
  const plateAttr = new BufferAttribute(plateData, 3);
  const plateLlAttr = new BufferAttribute(plateLonLat, 2);
  plateGeom.setAttribute("position", plateAttr);
  plateGeom.setAttribute("aLonLat", plateLlAttr);
  const plateSegments = plateData.length / 6;
  plateGeom.setDrawRange(0, 0);
  const plateLines = new LineSegments(
    plateGeom,
    new LineBasicMaterial({ color: COLOR_PLATES, transparent: true, opacity: 0.9 }),
  );
  morphable(plateLines.material, morph);
  plateLines.renderOrder = 3;
  spin.add(plateLines);

  /* The bright edge of the reveal. Same buffer, sorted nearest-first, so it is a second draw range
     sliding along it rather than a shader. */
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
   * Night, as one shell over all the geography rather than a light in each of its four shaders.
   *
   * Under the markers: an earthquake at 3am is not dimmer than one at noon.
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
          // Object space: where the sun is depends on where a point is on Earth, not on where the projection
          // drew it, and the model matrix repeats the flat map sideways.
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
          /* On the map, rebuild the direction per fragment. Flattening stretches these triangles, and an
             interpolated normal is only exact at their corners: a crease ran along every shared diagonal.
             See ARCHITECTURE.md. */
          float lam = radians(vLonLat.x);
          float phi = radians(vLonLat.y);
          float c = cos(phi);
          vec3 fromLonLat = vec3(c * sin(lam), sin(phi), c * cos(lam));
          float sun = dot(normalize(mix(normalize(vNormal), fromLonLat, uMorph)), normalize(uSun));

          /*
           * Darkens one side and lifts the other. Darkening alone reads as a disc with a shadow, not a lit ball.
           *
           * The two factors must not overlap. Where they do, a band of mid-grey reads as haze on the lens.
           */
          float night = smoothstep(0.10, -0.30, sun);
          float day = smoothstep(0.10, 0.55, sun);

          /* The moon's shadow, on the few days there is one. uPenumbraAng is zero otherwise, so almost
             every frame pays one compare for it. Move night and day together. Dimming the day alone leaves
             a grey shadow, which is not what being inside one looks like. See ARCHITECTURE.md. */
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

          /* Falls off toward the limb, or the lit side is a flat circle rather than a sphere. Take the day
             wash away rather than adding shadow. See ARCHITECTURE.md. */
          vec3 toEye = normalize(cameraPosition - vNormal * ${RADIUS_NIGHT});
          float edge = (1.0 - clamp(dot(vNormal, toEye), 0.0, 1.0)) * (1.0 - uMorph);
          day *= mix(1.0, 0.32, smoothstep(0.30, 0.94, edge));

          /* The aurora, in the one shader that already knows where night is. No backticks in here - one of
             them ends the shader. The morph module warns about this in as many words and I walked into it
             anyway. See ARCHITECTURE.md. */
          vec2 auv = vec2(fract(vLonLat.x / 360.0), (vLonLat.y + 90.0) / 180.0);
          float glow = clamp(texture2D(uAurora, auv).r * 3.0, 0.0, 1.0) * night * uAuroraOn;

          /* A quarter of a level of noise, because this overlay's alpha changes by less than 1/255 over
             tens of pixels and an 8-bit framebuffer turns that into flat bands across Russia. See
             ARCHITECTURE.md. */
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
        /* Zero radii means no eclipse, which is every day but a handful a year. */
        uEclipse: { value: new Vector3(0, 0, 1) },
        uPenumbraAng: { value: 0 },
        uUmbraAng: { value: 0 },
        // Achromatic. A warm daylight would put hue on the one surface the data is drawn against.
        uDayColor: { value: new Color(0x9fb0cc) },
        /* Deep enough to read as night, shallow enough that the geography survives it. At 0.38 land in
           shadow against ocean in daylight measured 1.084:1, so the lighting out-contrasted what it was
           lighting. See ARCHITECTURE.md. */
        uDepth: { value: 0.44 },
        uLift: { value: 0.11 },
        uAurora: { value: aurora },
        uAuroraOn: { value: 0 },
        /* Green, and one of only three hues here that are not a magnitude: this, the rim and the day wash, all
           of them light rather than marks. Everything drawn after this is a mark and stays achromatic. */
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

  // On `spin` rather than `world`, so the glyphs travel with the flat map's copies.
  const marks = createMarkLayer(morph);
  spin.add(marks.object);
  spin.add(marks.highlight);
  let heldMarks: readonly Mark[] = [];

  const sunDir = new Vector3();
  const eclipseDir = new Vector3(0, 0, 1);
  /** 0 surface, 1 hypocentre. Read by the hit test, written by the setter below. */
  let sink = 0;

  let slabOn = false;

  let sunMinute = -1;
  /* The instant the sun, sky and moon are aimed at, or null to follow the wall clock. See ARCHITECTURE.md. */
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

    /* Aimed from the same instant as everything else: tonight's shadow over an archived April is nonsense. */
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

  /* Nothing under `world` is culled against its own bounds, because those bounds are the wrong shape. See
     ARCHITECTURE.md. */
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
    /* What is under the pointer, answered geographically first and in pixels second. See ARCHITECTURE.md. */
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
    /* Which moment the sky is of. See ARCHITECTURE.md. */
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

      /* The fill is culled on the globe and not on the map. See ARCHITECTURE.md. */
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

      /* The map repeats by drawing the world again beside itself. Only the copies that intersect the view
         are drawn: two most of the time, one zoomed in. See ARCHITECTURE.md. */
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
