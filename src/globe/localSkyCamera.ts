import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { DEG, toVec3 } from "../geo/sphere";
import type { SkyCity, TonightView } from "../geo/tonight";
import type { CameraState } from "./controlsTypes";

const SURFACE_EYE = 1.012;
const LOCAL_FOV = 64;
const ECLIPSE_ARRIVAL_MS = 1100;
const ARRIVAL = 1.6;
const DEPARTURE = 0.85;
const smooth = (t: number) => t * t * (3 - 2 * t);

export function createLocalSkyCamera(
  camera: PerspectiveCamera,
  state: () => CameraState,
  fly: (lon: number, lat: number, zoom?: number) => void,
) {
  const orbitalFov = camera.fov;
  const localUp = new Vector3();
  const east = new Vector3();
  const north = new Vector3();
  const eye = new Vector3();
  const heading = new Vector3();
  const aim = new Vector3();
  const orientation = new Quaternion();
  const matrix = new Matrix4();
  const from = new Vector3();
  const destination = new Vector3();
  const fromOrientation = new Quaternion();
  const route = new Quaternion();
  const turn = new Quaternion();
  let fromRadius = 0;
  let fromFov = orbitalFov;
  let fromAmount = 0;
  let eclipseStarted = 0;
  let view: TonightView | null = null;
  let city: SkyCity | null = null;
  let saved: CameraState | null = null;
  let progress = 1;
  let amount = 0;
  let azimuth = 0;
  let altitude = 16;
  let restoreOrbit = false;

  function begin() {
    fromRadius = camera.position.length();
    from.copy(camera.position).normalize();
    fromOrientation.copy(camera.quaternion);
    fromFov = camera.fov;
    fromAmount = amount;
    progress = 0;
  }

  function step(dt: number, reduced: boolean): boolean {
    const next = view?.city ?? null;
    const eclipse = view?.sunCover !== undefined;
    if (city !== next) {
      begin();
      city = next;
      if (city && view) {
        localUp.set(...toVec3(city.lon, city.lat, 1));
        east.set(Math.cos(city.lon * DEG), 0, -Math.sin(city.lon * DEG));
        north.crossVectors(localUp, east);
        eye.copy(localUp).multiplyScalar(SURFACE_EYE);
        ({ azimuth, altitude } = view.look);
        fly(city.lon, city.lat, 1.35);
      } else {
        if (saved && restoreOrbit) fly(saved.lon, saved.lat, saved.zoom);
        saved = null;
      }
    }
    progress = reduced
      ? 1
      : eclipse
        ? Math.min(1, (performance.now() - eclipseStarted) / ECLIPSE_ARRIVAL_MS)
        : Math.min(1, progress + dt / (view ? ARRIVAL : DEPARTURE));

    if (!view) {
      amount = fromAmount * (1 - smooth(progress));
      return progress < 1;
    }
    const azimuthDelta = ((view.look.azimuth - azimuth + 540) % 360) - 180;
    const altitudeDelta = view.look.altitude - altitude;
    const gain = reduced ? 1 : -Math.expm1(-9 * dt);
    azimuth = Math.abs(azimuthDelta) < 0.04 ? view.look.azimuth : (azimuth + azimuthDelta * gain + 360) % 360;
    altitude = Math.abs(altitudeDelta) < 0.04 ? view.look.altitude : altitude + altitudeDelta * gain;
    return progress < 1 || azimuth !== view.look.azimuth || altitude !== view.look.altitude;
  }

  return {
    set(next: TonightView | null, restore: boolean) {
      if (next) saved ??= state();
      if (next?.sunCover !== undefined && (next.city !== view?.city || view.sunCover === undefined)) {
        eclipseStarted = performance.now();
        if (next.city === city) begin();
      }
      view = next;
      restoreOrbit = restore;
    },
    active: () => view !== null || city !== null || progress < 1,
    amount: () => amount,
    up: localUp,
    ready: () => progress === 1 && city === (view?.city ?? null),
    step,
    apply() {
      if (!view && progress === 1) {
        if (camera.fov !== orbitalFov) {
          camera.fov = orbitalFov;
          camera.updateProjectionMatrix();
        }
        return;
      }
      let radius = camera.position.length();
      destination.copy(camera.position).normalize();
      orientation.copy(camera.quaternion);
      if (view) {
        const pitch = Math.min(88, altitude) * DEG;
        const bearing = azimuth * DEG;
        heading.copy(north).multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing));
        aim.copy(eye).addScaledVector(heading, Math.cos(pitch)).addScaledVector(localUp, Math.sin(pitch));
        orientation.setFromRotationMatrix(matrix.lookAt(eye, aim, localUp));
        radius = SURFACE_EYE;
        destination.copy(localUp);
      }

      // Turn above the surface before pitching up into the horizon. On departure, climb while turning back.
      const advance = view ? smooth(Math.min(1, progress / 0.82)) : smooth(progress);
      const approach = view ? smooth(Math.max(0, (progress - 0.18) / 0.82)) : advance;
      route.setFromUnitVectors(from, destination);
      turn.identity().slerp(route, advance);
      const clearance = view ? Math.max(0, 1.7 - fromRadius) * Math.sin(Math.PI * advance) : 0;
      camera.position
        .copy(from)
        .applyQuaternion(turn)
        .multiplyScalar(fromRadius + (radius - fromRadius) * approach + clearance);
      camera.quaternion.copy(fromOrientation).premultiply(turn).slerp(orientation, approach);
      const fov = fromFov + ((view ? LOCAL_FOV : orbitalFov) - fromFov) * approach;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      if (view) amount = fromAmount + (1 - fromAmount) * approach;
    },
  };
}
