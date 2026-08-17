import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene,
  ShaderMaterial, SphereGeometry, WebGLRenderer,
} from "three";
import {
  buildLand, RADIUS_ATMOSPHERE, RADIUS_GRATICULE, RADIUS_SPHERE, type LandGeometry,
} from "../geo/land";
import { DEG, graticule } from "../geo/sphere";
import { createControls, type Controls } from "./controls";
import { createEventLayer, type EventLayer } from "./events";
import { createRingLayer, type RingLayer } from "./rings";

/*
 * The globe, and nothing on it yet.
 *
 * Step 2 of PLAN.md, so there is deliberately no animation frame loop in this file. The camera is
 * placed once and the scene renders on mount and on resize. That is not a stub standing in for a
 * loop: DESIGN.md section 8 bans ambient rotation outright, so for as long as nothing is arriving
 * there is genuinely nothing to redraw, and an idle rAF burning a frame every 16ms to draw an
 * identical picture would be the first thing to cut later anyway.
 */

const COLOR_SPHERE = 0x0a101c;
const COLOR_LAND = 0x151d2e;
const COLOR_COAST = 0x243149;
const COLOR_RIM = new Color(0x7896be);

/** Where the camera settles. The Ring of Fire is where the data lives, so it faces the viewer. */
const FRAMING = { lon: 145, lat: 12 } as const;

const FOV = 32;
/** Fraction of the smaller viewport dimension the globe occupies. Leaves the limb room to glow. */
const FILL = 0.78;

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
    new LineBasicMaterial({ color: COLOR_COAST, transparent: true, opacity: 0.4 }),
  );
  grat.renderOrder = 2;
  spin.add(grat);

  const coastGeom = new BufferGeometry();
  coastGeom.setAttribute("position", new BufferAttribute(land.coast, 3));
  const coast = new LineSegments(coastGeom, new LineBasicMaterial({ color: COLOR_COAST }));
  coast.renderOrder = 3;
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
    controls.setFit(1 / (FILL * Math.tan((FOV / 2) * DEG) * limiting));
  };

  return {
    resize,
    controls,
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
