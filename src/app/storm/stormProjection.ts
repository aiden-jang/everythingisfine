import { DEG, toVec3 } from "../../geo/sphere";
import type { StormCamera } from "./stormTrack";

export type Vec = readonly [number, number, number];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function stormProjection(camera: StormCamera, width: number, height: number) {
  const lam = camera.lon * DEG;
  const phi = camera.lat * DEG;
  const cos = Math.cos(camera.pitch * DEG);
  const sin = Math.sin(camera.pitch * DEG);
  const rollCos = Math.cos(camera.bank * DEG);
  const rollSin = Math.sin(camera.bank * DEG);
  const forward = toVec3(camera.lon, camera.lat, 1);
  const east: Vec = [Math.cos(lam), 0, -Math.sin(lam)];
  const north: Vec = [-Math.sin(phi) * Math.sin(lam), Math.cos(phi), -Math.sin(phi) * Math.cos(lam)];
  const view = forward.map((value, i) => value * cos - north[i]! * sin) as unknown as Vec;
  const up = north.map((value, i) => value * cos + forward[i]! * sin) as unknown as Vec;
  const eye = forward.map((value, i) => value + view[i]! * camera.distance) as unknown as Vec;
  const focal = Math.min(width * 1.12, height * 1.3);
  const cx = width * 0.5;
  const cy = height * 0.56;
  const eyeEast = dot(eye, east);
  const eyeUp = dot(eye, up);
  const eyeView = dot(eye, view);
  const c = dot(eye, eye) - 1;

  function point(position: Vec): [number, number] {
    const x = dot(position, east);
    const y = dot(position, up) - sin;
    const z = Math.max(0.06, eyeView - dot(position, view));
    return [cx + ((x * rollCos - y * rollSin) * focal) / z, cy - ((x * rollSin + y * rollCos) * focal) / z];
  }

  // Solve the tangent-ray discriminant for the top and bottom of Earth's visible arc.
  function limb(x: number): [number, number] | null {
    const dx = (x - cx) / focal;
    const k0 = dx * (rollCos * eyeEast - rollSin * eyeUp) - eyeView;
    const k1 = rollSin * eyeEast + rollCos * eyeUp;
    const a = k1 * k1 - c;
    const b = 2 * k0 * k1;
    const constant = k0 * k0 - (1 + dx * dx) * c;
    const disc = b * b - 4 * a * constant;
    const cut = [0, height];
    const add = (dy: number) => {
      const y = cy - focal * dy;
      if (y > 0 && y < height) cut.push(y);
    };
    if (Math.abs(a) < 1e-9) {
      if (Math.abs(b) > 1e-9) add(-constant / b);
    } else if (disc >= 0) {
      add((-b - Math.sqrt(disc)) / (2 * a));
      add((-b + Math.sqrt(disc)) / (2 * a));
    }
    cut.sort((left, right) => left - right);
    for (let i = 0; i < cut.length - 1; i++) {
      const top = cut[i]!;
      const bottom = cut[i + 1]!;
      const dy = (cy - (top + bottom) * 0.5) / focal;
      if (k0 + k1 * dy < 0 && (a * dy + b) * dy + constant >= 0) return [top, bottom];
    }
    return null;
  }

  return { point, limb };
}
