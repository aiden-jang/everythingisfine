import { Vector3, type PerspectiveCamera } from "three";
import { DEG } from "../geo/sphere";
import { MAP_HALF_WIDTH } from "./morph";

const SHOULDER = 0.985;
const exactAngle = (px: number, distance: number, focal: number): number => {
  const u = px / focal;
  return Math.asin(Math.max(-1, Math.min(1, (u * distance) / Math.sqrt(1 + u * u)))) - Math.atan(u);
};

// Linear continuation at the limb prevents a grazing drag or panel lift from diverging.
export function perspectiveAngle(px: number, distance: number, focal: number): number {
  const limit = (focal * SHOULDER) / Math.sqrt(distance * distance - SHOULDER * SHOULDER);
  const absolute = Math.abs(px);
  if (absolute <= limit) return exactAngle(px, distance, focal);
  const at = exactAngle(limit, distance, focal);
  const slope = at - exactAngle(limit - 1, distance, focal);
  return Math.sign(px) * (at + (absolute - limit) * slope);
}

export function createGeographicProjection(camera: PerspectiveCamera, canvas: HTMLCanvasElement) {
  const world = new Vector3();
  const towardEye = new Vector3();
  return (lon: number, lat: number, radius: number, morph: number, centreLon: number) => {
    if (morph > 0.5) {
      let delta = lon - centreLon;
      delta -= Math.round(delta / 360) * 360;
      world.set(((centreLon + delta) / 180) * MAP_HALF_WIDTH, lat / 90, 0);
    } else {
      const phi = lat * DEG;
      const lam = lon * DEG;
      const c = Math.cos(phi);
      world.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
      // Match the shader's horizon test at the surface, even for a point below it.
      if (world.dot(towardEye.subVectors(camera.position, world)) <= 0) return null;
      world.multiplyScalar(radius);
    }
    const rect = canvas.getBoundingClientRect();
    world.project(camera);
    return {
      x: rect.left + ((world.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - world.y) / 2) * rect.height,
    };
  };
}
