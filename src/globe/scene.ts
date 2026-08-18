import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene,
  ShaderMaterial, SphereGeometry, WebGLRenderer,
} from "three";
import {
  buildLand, RADIUS_ATMOSPHERE, RADIUS_GRATICULE, RADIUS_SPHERE, type LandGeometry,
} from "../geo/land";
import { DEG, distanceKm, graticule } from "../geo/sphere";
import { buildPlates } from "../geo/plates";
import { matches } from "../data/filter";
import type { Filters, SourceId } from "../data/types";
import { createControls, type Controls } from "./controls";
import { createEventLayer, type EventLayer } from "./events";
import { createRingLayer, type RingLayer } from "./rings";

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
  const spin = new Group();
  scene.add(spin);

  const ocean = new Mesh(
    new SphereGeometry(RADIUS_SPHERE, 96, 64),
    new MeshBasicMaterial({ color: COLOR_SPHERE }),
  );
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
  const fill = new Mesh(fillGeom, new MeshBasicMaterial({
    color: COLOR_LAND,
    depthTest: false,
    depthWrite: false,
  }));
  fill.renderOrder = 1;
  spin.add(fill);

  const gratGeom = new BufferGeometry();
  gratGeom.setAttribute("position", new BufferAttribute(graticule(15, RADIUS_GRATICULE), 3));
  const grat = new LineSegments(
    gratGeom,
    new LineBasicMaterial({ color: COLOR_GRATICULE, transparent: true, opacity: 0.38 }),
  );
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
  plateGeom.setAttribute("position", new BufferAttribute(buildPlates(), 3));
  const plateLines = new LineSegments(
    plateGeom,
    new LineBasicMaterial({ color: COLOR_PLATES, transparent: true, opacity: 0.9 }),
  );
  plateLines.renderOrder = 3;
  spin.add(plateLines);

  const coastGeom = new BufferGeometry();
  coastGeom.setAttribute("position", new BufferAttribute(land.coast, 3));
  const coast = new LineSegments(coastGeom, new LineBasicMaterial({ color: COLOR_COAST }));
  coast.renderOrder = 4;
  spin.add(coast);

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
  const events = createEventLayer(capacity);
  scene.add(events.object);
  const rings = createRingLayer();
  scene.add(rings.object);

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
    const fit = 1 / (FILL * Math.tan((FOV / 2) * DEG) * limiting);
    controls.setFit(fit);
    // The globe's on-screen radius at the framing shot, which is what marker sizes scale against.
    const radiusPx = (height / 2) * (1 / (fit * Math.tan((FOV / 2) * DEG)));
    events.setGlobeRadius(radiusPx);
    markerScale = () => Math.max(0.45, Math.min(1, radiusPx / 300));
  };

  return {
    resize,
    controls,
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
    render: () => renderer.render(scene, camera),
    dispose: () => {
      events.dispose();
      rings.dispose();
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
