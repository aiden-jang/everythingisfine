import { APRIL_ECLIPSE_PATH } from "./aprilEclipseData";

export const APRIL_ECLIPSE_DAY = "2024-04-08";
export const APRIL_ECLIPSE_START = Date.parse(`${APRIL_ECLIPSE_DAY}T16:40:00Z`);
const ROW_MS = 120_000;
export const APRIL_ECLIPSE_END = APRIL_ECLIPSE_START + (APRIL_ECLIPSE_PATH.length - 1) * ROW_MS;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function aprilEclipseAt(at: number): { lat: number; lon: number; widthKm: number } | null {
  if (!(at >= APRIL_ECLIPSE_START && at <= APRIL_ECLIPSE_END)) return null;
  const index = (at - APRIL_ECLIPSE_START) / ROW_MS;
  const row = Math.floor(index);
  const before = APRIL_ECLIPSE_PATH[row]!;
  const after = APRIL_ECLIPSE_PATH[row + 1] ?? before;
  const fraction = index - row;
  return {
    lat: lerp(before[0], after[0], fraction),
    lon: lerp(before[1], after[1], fraction),
    widthKm: lerp(before[2], after[2], fraction),
  };
}
