import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { DEG, toVec3 } from "../geo/sphere";
import type { SkyCity, TonightView } from "../geo/tonight";
import type { CameraState } from "./controlsTypes";

const SURFACE_EYE = 1.012;
const LOCAL_FOV = 64;

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
  let view: TonightView | null = null;
  let city: SkyCity | null = null;
  let saved: CameraState | null = null;
  let blend = 0;
  let azimuth = 0;
  let altitude = 16;
  let restoreOrbit = false;

  function step(dt: number, reduced: boolean, arrived: boolean): boolean {
    const next = view?.city ?? null;
    if (city !== next) {
      blend = reduced ? 0 : Math.max(0, blend - dt / 0.7);
      if (blend > 0) return true;
      city = next;
      if (city && view) {
        localUp.set(...toVec3(city.lon, city.lat, 1));
        east.set(Math.cos(city.lon * DEG), 0, -Math.sin(city.lon * DEG));
        north.crossVectors(localUp, east);
        eye.copy(localUp).multiplyScalar(SURFACE_EYE);
        ({ azimuth, altitude } = view.look);
        fly(city.lon, city.lat, 1.35);
        if (!reduced) return true;
      } else {
        if (saved && restoreOrbit) fly(saved.lon, saved.lat, saved.zoom);
        saved = null;
      }
    }
    if (!view) return false;
    if (arrived || reduced) blend = reduced ? 1 : Math.min(1, blend + dt / 1.5);
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
      view = next;
      restoreOrbit = restore;
    },
    active: () => city !== null || view !== null,
    amount: () => blend,
    up: localUp,
    ready: () => (view ? blend === 1 && city === view.city : city === null),
    step,
    apply() {
      const t = blend * blend * (3 - 2 * blend);
      const fov = orbitalFov + (LOCAL_FOV - orbitalFov) * t;
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
      camera.position.lerp(eye, t);
      camera.quaternion.slerp(orientation, t);
    },
  };
}
