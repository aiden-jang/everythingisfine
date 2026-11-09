import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { DEG, toVec3 } from "../geo/sphere";
import type { SkyCity, TonightView } from "../geo/tonight";
import type { CameraState } from "./controlsTypes";

const SURFACE_EYE = 1.012;
const LOCAL_FOV = 64;
const ECLIPSE_ARRIVAL_MS = 1100;
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
  const entryDirection = new Vector3();
  const entryDestination = new Vector3();
  const entryOrientation = new Quaternion();
  const entryTurn = new Quaternion();
  const turn = new Quaternion();
  let entryDistance = 0;
  let entryFov = 0;
  let eclipseStarted = 0;
  let view: TonightView | null = null;
  let city: SkyCity | null = null;
  let saved: CameraState | null = null;
  let blend = 0;
  let azimuth = 0;
  let altitude = 16;
  let restoreOrbit = false;

  function step(dt: number, reduced: boolean, arrived: boolean): boolean {
    const next = view?.city ?? null;
    const eclipse = view?.sunCover !== undefined;
    if (city !== next) {
      blend = reduced || eclipse ? 0 : Math.max(0, blend - dt / 0.7);
      if (blend > 0) return true;
      city = next;
      if (city && view) {
        localUp.set(...toVec3(city.lon, city.lat, 1));
        east.set(Math.cos(city.lon * DEG), 0, -Math.sin(city.lon * DEG));
        north.crossVectors(localUp, east);
        eye.copy(localUp).multiplyScalar(SURFACE_EYE);
        ({ azimuth, altitude } = view.look);
        fly(city.lon, city.lat, 1.35);
        if (!reduced && !eclipse) return true;
      } else {
        if (saved && restoreOrbit) fly(saved.lon, saved.lat, saved.zoom);
        saved = null;
      }
    }
    if (!view) return false;
    if (reduced) blend = 1;
    else if (eclipse) blend = Math.min(1, (performance.now() - eclipseStarted) / ECLIPSE_ARRIVAL_MS);
    else if (arrived) blend = Math.min(1, blend + dt / 1.5);
    const azimuthDelta = ((view.look.azimuth - azimuth + 540) % 360) - 180;
    const altitudeDelta = view.look.altitude - altitude;
    const gain = reduced ? 1 : -Math.expm1(-9 * dt);
    azimuth = Math.abs(azimuthDelta) < 0.04 ? view.look.azimuth : (azimuth + azimuthDelta * gain + 360) % 360;
    altitude = Math.abs(altitudeDelta) < 0.04 ? view.look.altitude : altitude + altitudeDelta * gain;
    return blend < 1 || azimuth !== view.look.azimuth || altitude !== view.look.altitude;
  }

  return {
    set(next: TonightView | null, restore: boolean) {
      if (next) saved ??= state();
      if (next?.sunCover !== undefined && (next.city !== view?.city || view.sunCover === undefined)) {
        eclipseStarted = performance.now();
        entryDistance = camera.position.length();
        entryDirection.copy(camera.position).normalize();
        entryTurn.setFromUnitVectors(
          entryDirection,
          entryDestination.set(...toVec3(next.city.lon, next.city.lat, 1)),
        );
        entryOrientation.copy(camera.quaternion);
        entryFov = camera.fov;
        blend = 0;
      }
      view = next;
      restoreOrbit = restore;
    },
    active: () => city !== null || view !== null,
    amount: () => blend,
    up: localUp,
    ready: () => (view ? blend === 1 && city === view.city : city === null),
    step,
    apply() {
      const eclipse = view?.sunCover !== undefined;
      const t = eclipse ? smooth(Math.max(0, (blend - 0.18) / 0.82)) : smooth(blend);
      const fromFov = eclipse ? entryFov : orbitalFov;
      const fov = fromFov + (LOCAL_FOV - fromFov) * t;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      if (blend === 0) return;
      const pitch = Math.min(88, altitude) * DEG;
      const bearing = azimuth * DEG;
      heading.copy(north).multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing));
      aim.copy(eye).addScaledVector(heading, Math.cos(pitch)).addScaledVector(localUp, Math.sin(pitch));
      orientation.setFromRotationMatrix(matrix.lookAt(eye, aim, localUp));
      if (eclipse && blend < 1) {
        const travel = smooth(Math.min(1, blend / 0.8));
        turn.identity().slerp(entryTurn, travel);
        // Keep the approach above the globe even when the starting point and city are far apart.
        const lift = Math.max(0, 1.7 - entryDistance) * Math.sin(Math.PI * travel);
        const distance = entryDistance + (SURFACE_EYE - entryDistance) * t + lift;
        camera.position.copy(entryDirection).applyQuaternion(turn).multiplyScalar(distance);
        camera.quaternion.copy(entryOrientation).premultiply(turn).slerp(orientation, t);
      } else {
        camera.position.lerp(eye, t);
        camera.quaternion.slerp(orientation, t);
      }
    },
  };
}
