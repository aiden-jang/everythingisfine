import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { DEG } from "../geo/sphere";
import { MAP_HALF_WIDTH, mapRepeatSpacing, projectionMoving, unfoldPoint } from "./morph";

const wrap = (lon: number): number => lon - 360 * Math.floor((lon + 180) / 360);

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
  const normal = new Vector3();
  return (lon: number, lat: number, radius: number, morph: number, centreLon: number) => {
    if (morph === 1) {
      const centre = wrap(centreLon);
      world.set(((centre + wrap(lon - centre)) / 180) * MAP_HALF_WIDTH, lat / 90, 0);
    } else if (morph > 0) {
      unfoldPoint(world, lon, lat, morph, radius - 1, normal);
      const period = mapRepeatSpacing(morph);
      if (period) world.x += Math.round((camera.position.x - world.x) / period) * period;
      if (normal.dot(towardEye.subVectors(camera.position, world)) <= 0) return null;
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

export function createUnfoldCamera(camera: PerspectiveCamera) {
  const target = new Vector3();
  let previousLon: number | null = null;
  return {
    reset(): void {
      previousLon = null;
    },
    place(lon: number, lat: number, distance: number, t: number): void {
      if (t === 1) {
        previousLon = wrap(lon);
        const x = (previousLon / 180) * MAP_HALF_WIDTH;
        camera.position.set(x, lat / 90, distance);
        camera.lookAt(x, lat / 90, 0);
        return;
      }
      // Choose the continuous longitude even if a flight reaches the other side of the seam mid-curl.
      previousLon = previousLon === null ? wrap(lon) : previousLon + wrap(lon - previousLon);
      const pullback = Math.sin(Math.PI * t);
      const viewLon = previousLon * (1 - 0.48 * pullback);
      const viewLat = lat * (1 - 0.48 * pullback);
      const yaw = viewLon * DEG * (1 - t);
      const tilt = viewLat * DEG * (1 - t) + 0.12 * pullback;
      const distanceBack = distance + 1.6 * pullback;
      unfoldPoint(target, viewLon, viewLat, t).multiplyScalar(t);
      camera.position
        .set(Math.cos(tilt) * Math.sin(yaw), Math.sin(tilt), Math.cos(tilt) * Math.cos(yaw))
        .multiplyScalar(distanceBack)
        .add(target);
      camera.lookAt(target);
      camera.rotateZ(-0.065 * pullback);
    },
  };
}

/** Read the geographic surface beneath a pixel in either projection. */
export function createGeographicPicking(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  morph: () => number,
) {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  return (clientX: number, clientY: number): { lon: number; lat: number } | null => {
    if (projectionMoving(morph())) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;

    /*
     * On the map the ray meets a plane, not a ball. Raycasting the sphere still returns an answer,
     * which is worse than none: hover looked like it worked and named the wrong earthquake.
     */
    if (morph() === 1) {
      if (Math.abs(d.z) < 1e-6) return null;
      const t = -o.z / d.z;
      if (t < 0) return null;
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      if (Math.abs(y) > 1) return null;
      return {
        lon: (((((x / MAP_HALF_WIDTH) * 180 + 180) % 360) + 360) % 360) - 180,
        lat: y * 90,
      };
    }

    // Analytic against the unit sphere, not against the ocean mesh: tessellation cannot throw it off
    // and it still answers while the mesh is rebuilding.
    const b = o.dot(d);
    const c = o.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) return null;

    hit
      .copy(d)
      .multiplyScalar(-b - Math.sqrt(disc))
      .add(o);
    return {
      lon: Math.atan2(hit.x, hit.z) / DEG,
      lat: Math.asin(Math.max(-1, Math.min(1, hit.y))) / DEG,
    };
  };
}
