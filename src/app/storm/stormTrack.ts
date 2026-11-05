import katrina from "./katrina.json";

export const FIXES = katrina.track.map((fix) => ({ ...fix, time: Date.parse(fix.at) }));
export const START = FIXES[0]!.time;
export const LANDFALL = FIXES.at(-1)!;
export const TRACK_MINUTES = (LANDFALL.time - START) / 60_000;
export const APPROACH_MS = 1800;
const TRAVEL_MS = 10_200;
const SETTLE_MS = 1500;
export const FLIGHT_MS = APPROACH_MS + TRAVEL_MS + SETTLE_MS;
export const SURVEY_MS = TRAVEL_MS;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => x * x * (3 - 2 * x);

export function stormAt(minute: number) {
  const at = START + 60_000 * Math.max(0, Math.min(TRACK_MINUTES, minute));
  const index = FIXES.findIndex((fix) => fix.time > at);
  const fixIndex = index === -1 ? FIXES.length - 1 : index - 1;
  const from = FIXES[fixIndex]!;
  const to = FIXES[index] ?? from;
  const t = to.time === from.time ? 0 : (at - from.time) / (to.time - from.time);
  const radii = (a: number[] | null, b: number[] | null) =>
    a && b ? a.map((value, quadrant) => mix(value, b[quadrant]!, t)) : a;
  return {
    at,
    fix: from,
    fixIndex,
    lon: mix(from.lon, to.lon, t),
    lat: mix(from.lat, to.lat, t),
    r34: radii(from.r34, to.r34),
    r64: radii(from.r64, to.r64),
  };
}

export function stormClock(at: number): string {
  const stamp = new Date(at).toISOString();
  return `${stamp.slice(8, 10)} Aug · ${stamp.slice(11, 16)} UTC`;
}

export function stormCategory(wind: number): number {
  return wind >= 137 ? 5 : wind >= 113 ? 4 : 3;
}

export interface StormCamera {
  lon: number;
  lat: number;
  pitch: number;
  bank: number;
  distance: number;
}

const overview: StormCamera = { lon: -88.2, lat: 27.25, pitch: 9, bank: 0, distance: 0.255 };
const entry: StormCamera = { lon: -85.1, lat: 25.0, pitch: 63, bank: -10, distance: 0.54 };

function blend(from: StormCamera, to: StormCamera, t: number): StormCamera {
  return {
    lon: mix(from.lon, to.lon, t),
    lat: mix(from.lat, to.lat, t),
    pitch: mix(from.pitch, to.pitch, t),
    bank: mix(from.bank, to.bank, t),
    distance: mix(from.distance, to.distance, t),
  };
}

export function stormFrame(elapsed: number, survey: boolean) {
  const fraction = clamp(survey ? elapsed / SURVEY_MS : (elapsed - APPROACH_MS) / TRAVEL_MS);
  const storm = stormAt(fraction * TRACK_MINUTES);
  if (survey) return { storm, camera: overview };

  const chase: StormCamera = {
    lon: storm.lon - 0.3,
    lat: storm.lat + 0.75,
    pitch: mix(42, 31, fraction),
    bank: -3 - 7 * Math.sin(fraction * Math.PI),
    distance: mix(0.29, 0.23, fraction),
  };
  const approach = ease(clamp(elapsed / APPROACH_MS));
  const settle = ease(clamp((elapsed - APPROACH_MS - TRAVEL_MS) / SETTLE_MS));
  const camera = elapsed < APPROACH_MS ? blend(entry, chase, approach) : blend(chase, overview, settle);
  return { storm, camera };
}

export const coast = katrina.coast;
