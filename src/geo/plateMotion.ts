import { DEG } from "./sphere";

/* How fast the plates move, and which way, at 231 points along their edges. Along a ridge the arrows run
   across it, at a trench they point into it, on a transform they lie along it. See ARCHITECTURE.md. */

/** `[lon, lat, azimuthDeg, mmPerYear, divergentSign, class]`, as generated. */
export type MotionSample = [number, number, number, number, number, string];

/** Fetched on first use, as its own chunk. Cached by the module system after that. */
export async function loadMotion(): Promise<readonly MotionSample[]> {
  const module = await import("./plateMotion.json");
  return module.default as MotionSample[];
}

/** Arrow length, in degrees of arc, from a rate in mm/a. Square-rooted, like the markers against magnitude:
 * the range is 0.3 to 263 mm/a, and linear scaling puts the median at a fiftieth of the longest arrow. */
const MAX_DEG = 3.4;
const MAX_RATE = 263.3;

export function arrowLengthDeg(mmPerYear: number): number {
  const t = Math.sqrt(Math.max(0, mmPerYear) / MAX_RATE);
  return Math.max(0.35, t * MAX_DEG);
}

/**
 * One arrow, as polylines in longitude and latitude: a shaft and two barbs. Walked with the
 * destination-point formula rather than offset in lon/lat, because an arrow drawn by adding degrees to a
 * longitude points the wrong way everywhere except the equator - by a factor of two at 60 north.
 */
export function motionArrow(
  lon: number,
  lat: number,
  azimuthDeg: number,
  mmPerYear: number,
): { lon: number; lat: number }[][] {
  const length = arrowLengthDeg(mmPerYear);
  const tip = walk(lon, lat, azimuthDeg, length);
  const barb = Math.max(0.25, length * 0.34);
  return [
    [{ lon, lat }, tip],
    [walk(tip.lon, tip.lat, azimuthDeg + 145, barb), tip],
    [walk(tip.lon, tip.lat, azimuthDeg - 145, barb), tip],
  ];
}

/** Destination point at a bearing and an arc distance. The same formula `antipode.ts` circles with. */
function walk(lon: number, lat: number, bearingDeg: number, arcDeg: number): { lon: number; lat: number } {
  const phi = lat * DEG;
  const theta = arcDeg * DEG;
  const bearing = bearingDeg * DEG;
  const lat2 = Math.asin(
    Math.sin(phi) * Math.cos(theta) + Math.cos(phi) * Math.sin(theta) * Math.cos(bearing),
  );
  const lon2 =
    lon * DEG +
    Math.atan2(
      Math.sin(bearing) * Math.sin(theta) * Math.cos(phi),
      Math.cos(theta) - Math.sin(phi) * Math.sin(lat2),
    );
  return { lon: ((lon2 / DEG + 540) % 360) - 180, lat: lat2 / DEG };
}

export interface MotionSummary {
  arrows: number;
  fastest: number;
  /** How many of the sampled boundaries are closing rather than opening. */
  converging: number;
}

export function summariseMotion(list: readonly MotionSample[]): MotionSummary {
  return {
    arrows: list.length,
    fastest: list.reduce((max, s) => Math.max(max, s[3]), 0),
    converging: list.filter((s) => s[4] < 0).length,
  };
}
