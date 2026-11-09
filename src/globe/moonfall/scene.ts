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
  OrthographicCamera,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  type Material,
  type WebGLRenderer,
} from "three";
import { DEG } from "../../geo/sphere";
import { traverses, valley, type loadLunarSurvey } from "../../sources/moonfall/apollo17";
import { roverRoutes } from "./routes";
import { lunarTerrain, lunarTexture } from "./terrain";

const FLIGHT_SECONDS = 6.4;
const ORBIT_END = 3.45;
const RADIUS = 1737.4;
const VOID = new Color(0x050b16);
const INSTRUMENT = new Color(0x0a101c);
const ease = (t: number) => t * t * (3 - 2 * t);
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

export function createMoonfall(data: Awaited<ReturnType<typeof loadLunarSurvey>>, reduced: boolean) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.025, 460_000);
  const map = new OrthographicCamera(-10, 10, 10, -10, 0.025, 120);
  const centerX = (valley.left + valley.right) / 2;
  const centerZ = (valley.near + valley.far) / 2;
  map.position.set(centerX, 48, centerZ);
  map.up.set(0, 0, -1);
  map.lookAt(centerX, 0, centerZ);
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
  let mapped = false;
  let eva = 0;
  let distance = 0;
  let station: number | null = null;
  let playing = false;
  let disposed = false;
  let current = { phase: "", flying, eva, meters: -1, station: null as number | null, playing, mapped };
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
    if (
      current.phase === phase &&
      current.flying === flying &&
      current.eva === eva &&
      current.meters === meters &&
      current.station === station &&
      current.playing === playing &&
      current.mapped === mapped
    )
      return;
    current = { phase, flying, eva, meters, station, playing, mapped };
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
      const approach = 59_000 * Math.exp(-5.55 * t - 2.37 * close);
      const aim = ease(limit((flight - 1.9) / 1.25));
      site.visible = flight > 1.7;
      site.scale.setScalar(lerp(1, 0.08, close));
      camera.near = 0.6;
      camera.far = 120_000;
      camera.position.set(lerp(-0.4, 0.28, aim) * approach, approach, lerp(0.56, 0.86, close) * approach);
      camera.up.set(0, 0.19 * Math.sin(Math.PI * t), -1);
      target.set(0, -RADIUS * (1 - aim), 0);
      light.position.set(-950, 810, 800);
      ambient.intensity = 0.37;
      scene.background = VOID;
    } else {
      const t = limit((flight - ORBIT_END) / (FLIGHT_SECONDS - ORBIT_END));
      const flyBy = Math.sin(Math.PI * t);
      const fit = Math.max(0.72, 1.12 / aspect);
      const locator = routes.set(eva, distance, station);
      camera.near = 0.025;
      camera.far = 120;
      camera.position.set(
        lerp(4.2, -0.55, ease(t)) * fit,
        (lerp(8.5, 10.9, ease(t)) - 5.6 * flyBy) * fit,
        (lerp(8.5, 8.3, ease(t)) - 1.4 * flyBy) * fit,
      );
      camera.up.set(0.19 * flyBy, 1, 0);
      target.set(lerp(1.25, -0.65, ease(t)), 0.6, lerp(-1.7, 0.2, ease(t)));
      if (flight === FLIGHT_SECONDS && (playing || station !== null || distance > 0)) {
        target.x += (locator.x - target.x) * 0.13;
        target.z += (locator.z - target.z) * 0.13;
      }
      light.position.set(-8, 6, -2);
      ambient.intensity = 1.15;
      scene.background = INSTRUMENT;
    }
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  return {
    read: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    step(dt: number, reduceMotion: boolean) {
      if (disposed) return false;
      if (reduceMotion && flight < FLIGHT_SECONDS) {
        finishFlight();
        update();
      }
      if (flying) {
        flight = Math.min(FLIGHT_SECONDS, flight + dt);
        if (flight >= FLIGHT_SECONDS) finishFlight();
        update();
      }
      if (playing) {
        const { km } = traverses[eva]!;
        distance = Math.min(km, distance + (dt / 12) * km);
        playing = distance < km;
        update();
      }
      return flying || playing;
    },
    render(renderer: WebGLRenderer, aspect: number) {
      if (disposed) return false;
      frame(aspect);
      if (mapped) {
        const halfHeight = Math.max(
          (valley.near - valley.far) / 2,
          (valley.right - valley.left) / (2 * aspect),
        );
        map.top = halfHeight;
        map.bottom = -halfHeight;
        map.right = halfHeight * aspect;
        map.left = -map.right;
        map.updateProjectionMatrix();
      }
      renderer.render(scene, mapped ? map : camera);
      return true;
    },
    project(next: boolean) {
      if (next) finishFlight();
      mapped = next;
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
