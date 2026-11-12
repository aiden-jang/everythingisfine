import { createNightSurface } from "./nightSurface";
import { createScenePresentation, type GlobePresentation } from "./scenePresentation";
import { lightSurface } from "./surfaceMaterial";
import { createCutaway, type CutawayFocus } from "./cutaway";
import { createEventPresentation } from "./eventPresentation";
import type { InspectionRun } from "../app/useEventInspection";
import { createEclipseTrack } from "./eclipseTrack";
import type { EclipseFrame } from "../app/eclipseReplay";
import { createRegroup } from "./regroup";
import { createSurfaceLayers } from "./surfaceLayers";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { buildLand, RADIUS_GRATICULE, RADIUS_SPHERE, type LandGeometry } from "../geo/land";
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
  attachLonLat,
  MAP_HALF_WIDTH,
  mapRepeatSpacing,
  morphable,
  SPHERE_PHI_START,
  visibleCopies,
} from "./morph";
import { matches } from "../data/filter";
import type { Filters, SourceId } from "../data/types";
import { createControls, type Controls } from "./controls";
import { createEventLayer, type EventLayer, markerRadiusPx, sinkFraction } from "./events";
import { createRingLayer, type RingLayer } from "./rings";
import { createSlabLayer } from "./slab";
import type { SlabPoint } from "../geo/slab";
import { writeAurora } from "./auroraTexture";
import { createMarkLayer, pickMark, type Mark } from "./marks";
import type { Aurora } from "../sources/aurora";

export type GlobeMoment = number | EclipseFrame | null;

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

/* The globe's palette, brightest last: sea, land, graticule, coast, plates. See ARCHITECTURE.md#srcglobescenets. */
const COLOR_SPHERE = 0x031120;
/* Must equal `--color-void` in `index.css`. Nothing checks it, and the canvas fades to this. */
const COLOR_LAND = 0x1c3d52;
const COLOR_COAST = 0x245b83;
const COLOR_GRATICULE = 0x13334e;
/* Brighter than the coastline on purpose: the boundary is why the earthquakes are in a line. */
const COLOR_PLATES = 0x316a97;

/* Greyer geography, for the colourblind ramp. That ramp is blue, and blue geography behind it stops being a
   separate thing you can see. Re-pick these by eye; scaling the blue ones down does not work. See ARCHITECTURE.md#srcglobescenets. */
const NEUTRAL = {
  sphere: 0x0a101c,
  land: 0x25334e,
  graticule: 0x243149,
  coast: 0x555663,
  plates: 0x646478,
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
  sphere: COLOR_SPHERE,
  land: COLOR_LAND,
  graticule: COLOR_GRATICULE,
  coast: COLOR_COAST,
  plates: COLOR_PLATES,
} as const;
const COLOR_RIM = new Color(0x7896be);
const COLOR_GLINT = new Color(0xa8c4e4);

/* The Ring of Fire faces the viewer, because that is where the earthquakes are. */
const FRAMING = { lon: 145, lat: 12 } as const;

const FOV = 32;
/** Fraction of the smaller viewport dimension the globe fills. */
const FILL = 0.86;

export interface Globe {
  resize: () => void;
  render: () => void;
  dispose: () => void;
  controls: Controls;
  events: EventLayer;
  rings: RingLayer;
  slab: ReturnType<typeof createSlabLayer>;
  setSlab: (points: readonly SlabPoint[] | null) => void;
  setAurora: (grid: Aurora | null) => void;
  setMoment: (value: GlobeMoment) => void;
  setInspection: (run: InspectionRun | null) => void;
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
  beginArrival: () => void;
  setPresentation: (mode: GlobePresentation) => void;
  setCutaway: (focus: CutawayFocus | null) => void;
  cutawayOpen: () => boolean;
  beginRegroup: (reduced: boolean) => void;
  cancelRegroup: () => void;
  stepPresentation: (dt: number, reduced: boolean) => boolean;
  /** Surface or true depth. Held here too, because the hit test cannot read a shader uniform. */
  setDepthSink: (on: boolean) => void;
  plates: {
    orderFrom: (points: readonly { lon: number; lat: number }[]) => void;
    reveal: (t: number) => void;
  };
  hitTest: (
    clientX: number,
    clientY: number,
    store: HitStore,
    filters: Filters,
    now: number,
    slopPx?: number,
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
  const catalogue = new Group();
  world.add(spin, catalogue);

  /* It has to be opaque. Three.js draws every opaque object before any transparent one and `renderOrder`
     only sorts within each group, so a transparent backdrop paints over the geography whatever you ask. */
  const mapBase = new Mesh(
    new PlaneGeometry(2 * MAP_HALF_WIDTH, 2),
    new MeshBasicMaterial({ color: COLOR_SPHERE }),
  );
  mapBase.position.z = -0.02;
  mapBase.renderOrder = -1;
  mapBase.visible = false;
  world.add(mapBase);

  const morph = { value: 0 };

  const oceanGeom = new SphereGeometry(RADIUS_SPHERE, 96, 64, SPHERE_PHI_START);
  attachLonLat(oceanGeom);
  const ocean = new Mesh(oceanGeom, new MeshBasicMaterial({ color: COLOR_SPHERE, side: DoubleSide }));
  morphable(ocean.material, morph);
  ocean.renderOrder = 0;
  spin.add(ocean);

  const land = buildLand();

  // Land fill has depth testing off so the ocean cannot poke through flat-degree triangles.
  const fillGeom = new BufferGeometry();
  fillGeom.setAttribute("position", new BufferAttribute(land.position, 3));
  fillGeom.setIndex(new BufferAttribute(land.index, 1));
  fillGeom.setAttribute("aLonLat", new BufferAttribute(land.lonLat, 2));
  const fill = new Mesh(
    fillGeom,
    new MeshBasicMaterial({
      color: COLOR_LAND,
      depthTest: false,
      depthWrite: false,
    }),
  );
  morphable(fill.material, morph);
  fill.renderOrder = 1;
  spin.add(fill);

  const gratGeom = new BufferGeometry();
  const grid = graticule(15, RADIUS_GRATICULE);
  gratGeom.setAttribute("position", new BufferAttribute(grid.position, 3));
  gratGeom.setAttribute("aLonLat", new BufferAttribute(grid.lonLat, 2));
  /* Drawn before the land, which is the only way it ends up behind it: the land writes no depth, so nothing
     occludes the graticule and it drew a starburst across Siberia. See ARCHITECTURE.md#srcglobescenets. */
  const grat = new LineSegments(
    gratGeom,
    new LineBasicMaterial({
      color: GRATICULE_ON({ sphere: COLOR_SPHERE, graticule: COLOR_GRATICULE }),
    }),
  );
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

  const { night, aurora, dayline } = createNightSurface(morph);
  spin.add(night);
  const eclipseTrack = createEclipseTrack();
  spin.add(eclipseTrack.path);

  const marks = createMarkLayer(morph);
  catalogue.add(marks.object, marks.highlight);
  let heldMarks: readonly Mark[] = [];

  const sunDir = new Vector3();
  const lights = createSurfaceLayers(sunDir, morph, COLOR_RIM, COLOR_GLINT);
  const { rim, glint } = lights;
  scene.add(rim);
  spin.add(glint);
  let quietMotion = false;
  lightSurface(ocean.material, sunDir, morph, true, lights.reveal);
  lightSurface(fill.material, sunDir, morph, false, lights.reveal);
  const eclipseDir = new Vector3(0, 0, 1);
  /** 0 surface, 1 hypocentre. Read by the hit test, written by the setter below. */
  let sink = 0;

  let slabOn = false;
  let sunMinute = -1;
  /* The instant the sun, sky and moon are aimed at, or null to follow the wall clock. See ARCHITECTURE.md#srcglobescenets. */
  let moment: number | null = null;
  const aimSun = (at: number): void => {
    const { lon, lat } = subsolarPoint(at);
    const phi = lat * (Math.PI / 180);
    const lam = lon * (Math.PI / 180);
    const c = Math.cos(phi);
    sunDir.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
    (night.material as ShaderMaterial).uniforms["uSun"]!.value = sunDir;
    /* Aimed from the same instant as everything else: tonight's shadow over an archived April is nonsense. */
    const shadow = solarEclipse(at);
    const nightUniforms = (night.material as ShaderMaterial).uniforms;
    if (shadow.touching && !presentation.shadows()) {
      eclipseDir.set(shadow.centre[0], shadow.centre[1], shadow.centre[2]);
      nightUniforms["uEclipse"]!.value = eclipseDir;
      nightUniforms["uPenumbraAng"]!.value = Math.asin(Math.min(1, shadow.penumbra));
      // Negative means annular: the cone closed before it landed, so there is no totality to draw.
      nightUniforms["uUmbraAng"]!.value = shadow.umbra > 0 ? Math.asin(Math.min(1, shadow.umbra)) : 0;
    } else {
      nightUniforms["uPenumbraAng"]!.value = 0;
      nightUniforms["uUmbraAng"]!.value = 0;
    }
    // Reuse the turn so a constellation line cannot separate from its stars.
    const sidereal = gmstDeg(at);
    starfield.setTime(at, sidereal);
    figures.setSpin(sidereal);
    // The same direction that lights the Earth lights the moon, which is where its phase comes from.
    moon.setTime(at, sunDir);
    moon.setUmbral(lunarEclipse(at).umbral);
    planets.setTime(at);
  };
  // Catalogue directions stay fixed; photographic exposure follows the rendered camera.
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

  const events = createEventLayer(capacity, "thermal", morph);
  catalogue.add(events.object);
  const rings = createRingLayer("thermal", morph);
  catalogue.add(rings.object);
  const slab = createSlabLayer(morph);
  catalogue.add(slab.object);

  /* Nothing under `world` is culled against its own bounds, because those bounds are the wrong shape. See ARCHITECTURE.md#srcglobescenets. */
  world.traverse((o) => {
    o.frustumCulled = false;
  });
  const controls = createControls(camera, canvas, FRAMING, FOV);
  const modern = [fill, coast, plateLines, plateEdge];
  const presentation = createScenePresentation(spin, catalogue, controls, sunDir, lights, dayline, canvas);
  const inspection = createEventPresentation(camera, controls, catalogue);
  spin.add(inspection.object);
  let markerScale = (): number => 1;
  const resize = (): void => {
    const parent = canvas.parentElement;
    if (!parent) return;
    // Presentation motion can transform the visible canvas while the renderer uses its final layout.
    const { clientWidth: width, clientHeight: height } = parent;
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

  const cutaway = createCutaway();
  world.add(cutaway.object);
  for (const layer of [ocean, fill, grat, plateLines, plateEdge, coast, night, glint]) {
    cutaway.patch(layer.material);
  }
  const regroup = createRegroup(events.object);
  catalogue.add(regroup.object);

  return {
    resize,
    controls,
    setInspection: (run) => {
      inspection.set(run);
      sunMinute = -1;
      if (moment !== null && run?.kind !== "sequence") aimSun(moment);
    },
    beginArrival: lights.begin,
    setPresentation: (mode) => {
      const previous = presentation.shadows();
      presentation.set(mode, modern);
      if (previous !== presentation.shadows() && moment !== null) aimSun(moment);
    },
    setCutaway: (focus) => {
      controls.setDive(focus?.dive === true);
      cutaway.set(focus);
      if (focus) lights.begin();
    },
    cutawayOpen: cutaway.isOpen,
    beginRegroup: regroup.begin,
    cancelRegroup: regroup.cancel,
    stepPresentation: (dt, reduced) => {
      quietMotion = reduced;
      const illuminating = lights.step(dt, reduced);
      const presenting = presentation.step(dt, reduced);
      const cutting = cutaway.step(dt, reduced, morph.value, !controls.diveReady());
      const tracing = figures.step(dt, reduced, !controls.skyReady());
      const grouping = regroup.step(dt, reduced);
      const settling = morph.value === 0 && !controls.framingReady();
      const following = inspection.step(dt, reduced, morph.value === 0);
      return cutting || tracing || grouping || illuminating || settling || following || presenting;
    },
    markerRadius: (magnitude: number): number => markerRadiusPx(magnitude, markerScale()),
    setGeography: (ramp: RampName): void => {
      const palette = ramp === "cividis" ? NEUTRAL : BLUEPRINT;
      slab.setRamp(ramp === "cividis" ? "cividis" : "thermal");
      (ocean.material as MeshBasicMaterial).color.setHex(palette.sphere);
      (fill.material as MeshBasicMaterial).color.setHex(palette.land);
      (grat.material as LineBasicMaterial).color.setHex(GRATICULE_ON(palette));
      (plateLines.material as LineBasicMaterial).color.setHex(palette.plates);
      (coast.material as LineBasicMaterial).color.setHex(palette.coast);
      mapBase.material.color.setHex(palette.sphere);
    },
    setDepthSink: (on: boolean): void => {
      sink = on ? 1 : 0;
      if (!on) cutaway.set(null);
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
    /* What is under the pointer, answered geographically first and in pixels second. See ARCHITECTURE.md#srcglobescenets. */
    hitTest: (clientX, clientY, store, filters, now, slopPx = HIT_SLOP_PX) => {
      if (!catalogue.visible) return null;
      const under = controls.pick(clientX, clientY);
      if (!under) return null;

      const near: { key: string; lon: number; lat: number; magnitude: number; depthKm: number }[] = [];
      let worst = Infinity;
      store.forEach((quake) => {
        if (!matches(quake as never, filters, now) || !events.includesTime(quake.primary.time)) return;
        const { lon, lat, magnitude, depthKm } = quake.primary;
        const km = distanceKm(under.lon, under.lat, lon, lat);
        if (near.length >= SHORTLIST && km >= worst) return;
        near.push({ key: quake.key, lon, lat, magnitude, depthKm });
        near.sort(
          (a, b) =>
            distanceKm(under.lon, under.lat, a.lon, a.lat) - distanceKm(under.lon, under.lat, b.lon, b.lat),
        );
        if (near.length > SHORTLIST) near.pop();
        const last = near[near.length - 1]!;
        worst = distanceKm(under.lon, under.lat, last.lon, last.lat);
      });

      let bestKey: string | null = null;
      let bestScore = Infinity;
      for (const candidate of near) {
        // Pick at the drawn depth, not the epicentre above it; flat projection has no sink.
        const at = controls.project(
          candidate.lon,
          candidate.lat,
          1 - sinkFraction(candidate.depthKm) * sink * (1 - controls.morph()),
        );
        if (!at) continue;
        const d = Math.hypot(at.x - clientX, at.y - clientY);
        // Use the shader's radius so picking cannot drift from the drawing.
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
      catalogue.visible ? pickMark(heldMarks, { x: clientX, y: clientY }, controls.project, slopPx) : null,
    events,
    rings,
    slab,
    setMarks: (next) => {
      heldMarks = next;
      marks.set(next);
    },
    setMarkZoom: (zoom) => {
      marks.setZoom(zoom);
    },
    setMarkHover: (id) => {
      marks.setHovered(id);
    },
    setSlab: (points) => {
      if (points === null) {
        slabOn = false;
        slab.setOpacity(0);
        return;
      }
      slab.set(points);
      slabOn = true;
      slab.setOpacity(1 - morph.value);
    },
    setMoment: (value) => {
      const frame = typeof value === "object" ? value : null;
      const at = typeof value === "number" ? value : (frame?.at ?? null);
      eclipseTrack.setTime(frame?.at ?? null);
      if (frame) controls.setView(frame.camera);
      moment = at;
      // Immediately, not on the next minute boundary, or a scrub drags the marks and leaves the light.
      if (at !== null && inspection.recordedAt() === null) aimSun(at);
      else sunMinute = -1;
    },
    setStars: (t: StarTable) => starfield.setStars(t),
    setFigures: (t: FigureTable) => figures.setFigures(t),
    setFiguresOn: (on: boolean) => {
      figures.setOn(on);
      if (on) lights.begin();
    },
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
      if (presentation.renderMoon(renderer, camera.aspect)) return;
      const at = inspection.recordedAt() ?? (moment === null ? Date.now() : null);
      if (at !== null) {
        const minute = Math.floor(at / 60_000);
        if (minute !== sunMinute) {
          sunMinute = minute;
          aimSun(at);
        }
      }
      const skyOpacity = (1 - morph.value) * presentation.skyOpacity(camera);
      starfield.prepare(camera, canvas.width, canvas.height, quietMotion || morph.value > 0);
      starfield.setOpacity(skyOpacity);
      moon.setOpacity(presentation.orbitalMoon() ? 0 : 1 - morph.value);
      figures.setOpacity(skyOpacity);
      planets.setOpacity(skyOpacity);
      if (slabOn) slab.setOpacity(1 - morph.value);

      /* The fill is culled on the globe and not on the map. See ARCHITECTURE.md#srcglobescenets. */
      const wantSide = morph.value === 1 ? DoubleSide : FrontSide;
      const fillMaterial = fill.material as MeshBasicMaterial;
      if (fillMaterial.side !== wantSide) {
        fillMaterial.side = wantSide;
        // `side` is part of the program cache key, so three.js needs telling it changed.
        fillMaterial.needsUpdate = true;
      }

      const period = mapRepeatSpacing(morph.value);
      mapBase.visible = morph.value === 1;
      if (!period) {
        world.position.x = 0;
        renderer.render(scene, camera);
        return;
      }

      /* The map repeats by drawing the world again beside itself. Only the copies that intersect the view
         are drawn: two most of the time, one zoomed in. See ARCHITECTURE.md#srcglobescenets. */
      const halfHeight = camera.position.z * Math.tan((FOV / 2) * (Math.PI / 180));
      const { first, last } = visibleCopies(camera.position.x, halfHeight * camera.aspect, period);

      renderer.autoClear = true;
      for (let k = first; k <= last; k += 1) {
        world.position.x = k * period;
        renderer.render(scene, camera);
        renderer.autoClear = false;
      }
      renderer.autoClear = true;
      world.position.x = 0;
    },
    dispose: () => {
      presentation.dispose();
      inspection.dispose();
      eclipseTrack.dispose();
      regroup.dispose();
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
      aurora.dispose();
      renderer.dispose();
    },
    stats: land.stats,
  };
}
