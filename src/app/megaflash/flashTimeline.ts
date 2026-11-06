import source from "./flash.json";

export const { bounds, lines, scan } = source;
export const trace = source.trace as [offsetMs: number, lon: number, lat: number][];
export const DURATION = 7391;
export const BIN = 250;
export const FINAL_STEP = Math.ceil(DURATION / BIN);

export interface FlashCamera {
  lon: number;
  lat: number;
  width: number;
  height: number;
  roll: number;
  tilt: number;
}

export const overview: FlashCamera = { lon: -94.7, lat: 35.6, width: 780, height: 1080, roll: 0, tilt: 1 };

const LEAD_IN = 1600;
const PACE = 2.1;
const SPREAD_END = LEAD_IN + DURATION * PACE;
export const FLIGHT_END = SPREAD_END + 2100;
const bank: FlashCamera = { lon: -94.8, lat: 34.6, width: 600, height: 730, roll: -0.19, tilt: 0.79 };
const north: FlashCamera = { lon: -94.25, lat: 36.3, width: 640, height: 855, roll: -0.12, tilt: 0.88 };

const blend = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => t * t * (3 - 2 * t);

function between(from: FlashCamera, to: FlashCamera, t: number): FlashCamera {
  return {
    lon: blend(from.lon, to.lon, t),
    lat: blend(from.lat, to.lat, t),
    width: blend(from.width, to.width, t),
    height: blend(from.height, to.height, t),
    roll: blend(from.roll, to.roll, t),
    tilt: blend(from.tilt, to.tilt, t),
  };
}

export function flashFrame(elapsed: number, fixed: boolean) {
  if (fixed) return { at: Math.min(DURATION, elapsed / PACE), camera: overview };
  const at = Math.min(DURATION, (elapsed - LEAD_IN) / PACE);
  const camera =
    elapsed < LEAD_IN
      ? between(overview, bank, ease(clamp(elapsed / LEAD_IN)))
      : elapsed < SPREAD_END
        ? between(bank, north, ease(at / DURATION))
        : between(north, overview, ease(clamp((elapsed - SPREAD_END) / (FLIGHT_END - SPREAD_END))));
  return { at, camera };
}

export const elapsedFor = (at: number) => at * PACE;
export const stepAt = (at: number) => (at >= DURATION ? FINAL_STEP : Math.max(0, Math.floor(at / BIN)));
export const timeAtStep = (step: number) => Math.min(DURATION, step * BIN);

export function flashTime(at: number) {
  if (at < 0) return "Before the flash";
  if (at >= DURATION) return "7.39 s";
  return `≈ ${((stepAt(at) * BIN) / 1000).toFixed(2)} s`;
}
