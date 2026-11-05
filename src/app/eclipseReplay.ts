import { APRIL_ECLIPSE_END, APRIL_ECLIPSE_START, aprilEclipseAt, lerp } from "../geo/aprilEclipse";
import type { CameraState } from "../globe/controls";

const APPROACH_END = 0.14;
const PULLBACK_START = 0.84;
const OVERVIEW: CameraState = { lon: -100, lat: 26, zoom: 0.9 };

export interface EclipseFrame {
  at: number;
  camera: CameraState;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

function blend(from: CameraState, to: CameraState, t: number): CameraState {
  const turn = ((((to.lon - from.lon + 180) % 360) + 360) % 360) - 180;
  return { lon: from.lon + turn * t, lat: lerp(from.lat, to.lat, t), zoom: lerp(from.zoom, to.zoom, t) };
}

export function pathFraction(progress: number): number {
  return Math.max(0, Math.min(1, (progress - APPROACH_END) / (PULLBACK_START - APPROACH_END)));
}

export function progressAt(fraction: number): number {
  return lerp(APPROACH_END, PULLBACK_START, fraction);
}

export function eclipseClock(at: number): string {
  return `${new Date(Math.round(at)).toISOString().slice(11, 16)} UTC`;
}

export function eclipseFrame(progress: number, from: CameraState, reduced: boolean): EclipseFrame {
  const at = lerp(APRIL_ECLIPSE_START, APRIL_ECLIPSE_END, pathFraction(progress));
  if (reduced) return { at, camera: OVERVIEW };

  const centre = aprilEclipseAt(at)!;
  const chase = { lon: centre.lon, lat: centre.lat, zoom: 1.75 };
  if (progress < APPROACH_END) return { at, camera: blend(from, chase, ease(progress / APPROACH_END)) };
  if (progress > PULLBACK_START) {
    return {
      at,
      camera: blend(chase, OVERVIEW, ease((progress - PULLBACK_START) / (1 - PULLBACK_START))),
    };
  }
  return { at, camera: chase };
}
