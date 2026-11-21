import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  type Material,
  type WebGLRenderer,
} from "three";
import { DEG } from "../../geo/sphere";
import { traverses, type loadLunarSurvey } from "../../sources/moonfall/apollo17";
import { roverRoutes } from "./routes";
import { lunarTerrain, lunarTexture } from "./terrain";

import { createValleyCamera, easeLunarMotion as ease } from "./valleyCamera";
import { createStopMarkers } from "./stopMarkers";

const FLIGHT_SECONDS = 6.4;
const ORBIT_END = 3.45;
const RADIUS = 1737.4;
const VOID = new Color(0x050b16);
const INSTRUMENT = new Color(0x0a101c);
const PROJECTION_SECONDS = 0.64;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const limit = (t: number) => Math.min(1, Math.max(0, t));

function moonGlobe(image: HTMLImageElement) {
  const moon = new Mesh(
    new SphereGeometry(RADIUS, 96, 64),
    new MeshStandardMaterial({ map: lunarTexture(image) }),
  );
  const phi = 20.19 * DEG;
  const lambda = 30.77 * DEG;
  const up = new Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda));
  const east = new Vector3(-Math.sin(lambda), 0, -Math.cos(lambda));
  const south = new Vector3().crossVectors(east, up);
  moon.setRotationFromMatrix(new Matrix4().makeBasis(east, up, south).invert());
  moon.position.set(0, -RADIUS, 0);
  return moon;
}

export type MoonfallView = ReturnType<typeof createMoonfall>;
export type MoonfallProgress = Pick<
  ReturnType<MoonfallView["read"]>,
  "eva" | "meters" | "station" | "mapped"
>;

export function createMoonfall(data: Awaited<ReturnType<typeof loadLunarSurvey>>, reduced: boolean) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.025, 460_000);
  const surveyCamera = createValleyCamera();
  const placeStops = createStopMarkers();
  const space = new Group();
  const surface = new Group();
  const ambient = new HemisphereLight(0xd9dbed, 0x777785, 1.14);
  const light = new DirectionalLight(0xffeedc, 1.75);
  const target = new Vector3();
  const terrain = lunarTerrain(data.elevations, data.terrain);
  const routes = roverRoutes(terrain.at);
  const site = new Mesh(
    new RingGeometry(25, 33, 48).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xeed0a7 }),
  );
  site.position.y = 2;
  space.add(moonGlobe(data.moon), site);
  surface.add(terrain.object, routes.root);
  scene.add(space, surface, ambient, light);

  let flight = reduced ? FLIGHT_SECONDS : 0;
  let flying = !reduced;
  let skipMotion = reduced;
  let mapped = false;
  let projection = 0;
  let eva = 0;
  let distance = 0;
  let station: number | null = null;
  let playing = false;
  let disposed = false;
  let current = {
    phase: "",
    flying,
    eva,
    meters: -1,
    station: null as number | null,
    playing,
    mapped,
    turning: false,
  };
  const listeners = new Set<() => void>();

  function update() {
    const phase = mapped
      ? "Taurus–Littrow landing map"
      : flight >= FLIGHT_SECONDS
        ? "Taurus–Littrow Valley"
        : flight >= ORBIT_END
          ? "Valley descent"
          : "Lunar approach";
    const meters = Math.round(distance * 1000);
    const turning = projection !== Number(mapped);
    if (
      current.phase === phase &&
      current.flying === flying &&
      current.eva === eva &&
      current.meters === meters &&
      current.station === station &&
      current.playing === playing &&
      current.mapped === mapped &&
      current.turning === turning
    )
      return;
    current = { phase, flying, eva, meters, station, playing, mapped, turning };
    for (const listener of listeners) listener();
  }
  update();

  function finishFlight() {
    flight = FLIGHT_SECONDS;
    flying = false;
  }

  function frame(aspect: number) {
    camera.aspect = aspect;
    const orbit = flight < ORBIT_END;
    space.visible = orbit;
    surface.visible = !orbit;
    if (orbit) {
      const t = ease(limit(flight / 3.23));
      const close = ease(limit((flight - 2.72) / 0.65));
      const distance = lerp(384_000, 59_000, ease(limit(flight / 0.98)));
      const approach = distance * Math.exp(-5.55 * t - 2.37 * close);
      const aim = ease(limit((flight - 1.9) / 1.25));
      site.visible = flight > 1.7;
      site.scale.setScalar(lerp(1, 0.08, close));
      camera.near = 0.6;
      camera.far = 460_000;
      camera.position.set(lerp(-0.4, 0.28, aim) * approach, approach, lerp(0.56, 0.86, close) * approach);
      camera.up.set(0, 0.19 * Math.sin(Math.PI * t), -1);
      target.set(0, -RADIUS * (1 - aim), 0);
      light.position.set(-950, 810, 800);
      ambient.intensity = 0.37;
      light.intensity = 1.75;
      scene.background = VOID;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      return camera;
    }
    const overhead = ease(projection);
    const relief = lerp(1, 0.02, overhead);
    surface.scale.y = relief;
    routes.set(eva, distance, station);
    light.position.set(-9 * (1 - overhead), lerp(3, 9, overhead), -4 * (1 - overhead));
    light.intensity = lerp(2.15, 0.55, overhead);
    ambient.intensity = lerp(0.8, 1.35, overhead);
    scene.background = INSTRUMENT;
    const t = limit((flight - ORBIT_END) / (FLIGHT_SECONDS - ORBIT_END));
    return surveyCamera(
      aspect,
      overhead,
      relief,
      t,
      station === null ? undefined : routes.stops(eva)[station],
    );
  }

  return {
    read: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    step(dt: number, reduceMotion: boolean) {
      if (disposed) return false;
      skipMotion = reduceMotion;
      if (reduceMotion && flight < FLIGHT_SECONDS) {
        finishFlight();
        update();
      }
      if (flying) {
        flight = Math.min(FLIGHT_SECONDS, flight + dt);
        if (flight >= FLIGHT_SECONDS) finishFlight();
        update();
      }
      const projectionTarget = Number(mapped);
      if (projection !== projectionTarget) {
        const increment = dt / PROJECTION_SECONDS;
        projection = reduceMotion
          ? projectionTarget
          : mapped
            ? Math.min(1, projection + increment)
            : Math.max(0, projection - increment);
        update();
      }
      if (playing) {
        const { km } = traverses[eva]!;
        distance = Math.min(km, distance + (dt / 12) * km);
        playing = distance < km;
        update();
      }
      return flying || playing || current.turning;
    },
    render(renderer: WebGLRenderer, aspect: number) {
      if (disposed) return false;
      const view = frame(aspect);
      renderer.render(scene, view);
      if (!flying) placeStops(renderer.domElement, view, surface.matrixWorld, routes.stops(eva));
      return true;
    },
    project(next: boolean, instant = skipMotion) {
      finishFlight();
      mapped = next;
      if (instant) projection = Number(next);
      update();
    },
    select(index: number) {
      finishFlight();
      eva = index;
      distance = 0;
      station = null;
      playing = false;
      update();
    },
    seek(meters: number) {
      finishFlight();
      station = null;
      const { km } = traverses[eva]!;
      distance = meters >= Math.round(km * 1000) ? km : Math.max(0, meters / 1000);
      playing = false;
      update();
    },
    stopAt(index: number) {
      finishFlight();
      station = index;
      distance = traverses[eva]!.stations[index]!.distance;
      playing = false;
      update();
    },
    toggleRoute() {
      finishFlight();
      station = null;
      if (!playing && distance >= traverses[eva]!.km) distance = 0;
      playing = !playing;
      update();
    },
    skip() {
      finishFlight();
      update();
    },
    replay() {
      mapped = false;
      projection = 0;
      flight = 0;
      flying = true;
      playing = false;
      update();
    },
    dispose() {
      disposed = true;
      listeners.clear();
      const geometries = new Set<{ dispose(): void }>();
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (!(object instanceof Mesh || object instanceof LineSegments)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          if (material instanceof MeshStandardMaterial) material.map?.dispose();
        }
      });
      for (const resource of [...geometries, ...materials]) resource.dispose();
    },
  };
}
