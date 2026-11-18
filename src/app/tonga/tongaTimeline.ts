import { DEG, toVec3 } from "../../geo/sphere";
import data from "./tonga.json";

export const { stations, infrared, vapor } = data;
export const sprite = { width: data.width, height: data.height, columns: data.columns };
export const START = 240;
export const ERUPTION = 260;
export const WATER_VAPOR = 290;
export const WAVE_ORIGIN = 268;
export const ANTIPODE = WAVE_ORIGIN + 18.1 * 60;
export const END = 1360;
export const ORIGIN = { lon: -175.387, lat: -20.536 };

const steps = [
  { elapsed: 0, minute: START },
  { elapsed: 5100, minute: WATER_VAPOR },
  { elapsed: 8200, minute: 380 },
  { elapsed: 12100, minute: 525 },
  { elapsed: 14400, minute: 575 },
  { elapsed: 17500, minute: 710 },
  { elapsed: 19700, minute: 753 },
  { elapsed: 20800, minute: 767 },
  { elapsed: 23000, minute: 815 },
  { elapsed: 24500, minute: 960 },
  { elapsed: 27100, minute: END },
];
export const DURATION = steps.at(-1)!.elapsed;
export const SURVEY_DURATION = 23_000;

export function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function minuteAt(elapsed: number, survey: boolean): number {
  if (survey) return Math.round(mix(START, END, clamp(elapsed / SURVEY_DURATION)) * 1e6) / 1e6;
  const next = steps.findIndex((step) => elapsed < step.elapsed);
  if (next < 1) return next === 0 ? START : END;
  const a = steps[next - 1]!;
  const b = steps[next]!;
  return mix(a.minute, b.minute, (elapsed - a.elapsed) / (b.elapsed - a.elapsed));
}

export function waveAngle(minute: number): number {
  return Math.PI * clamp((minute - WAVE_ORIGIN) / (ANTIPODE - WAVE_ORIGIN));
}

export function timeLabel(minute: number): string {
  const whole = Math.floor(minute);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export function timeIso(minute: number): string {
  return `${data.date}T${timeLabel(minute)}:00Z`;
}

export function latestScan(frames: typeof infrared, minute: number) {
  let index = frames.findIndex((frame) => frame.minute > minute);
  if (index === -1) index = frames.length;
  return Math.max(0, index - 1);
}

export function layersAt(minute: number, hasInfrared: boolean, hasVapor: boolean, still: boolean) {
  const vaporReady = hasVapor && minute >= WATER_VAPOR;
  const vaporMix = !vaporReady ? 0 : !hasInfrared || still ? 1 : clamp((minute - WATER_VAPOR) / 11);
  const orbitMix =
    !hasInfrared && !vaporReady ? 1 : still ? Number(minute >= 370) : clamp((minute - 344) / 40);
  return { vaporMix, orbitMix };
}

const stationChanges = stations
  .slice(1)
  .map((station, index) => Math.max(station.start, (stations[index]!.peak + station.peak) / 2));

export function stationAt(minute: number) {
  const next = stationChanges.findIndex((change) => minute < change);
  return (next < 0 ? stations.at(-1) : stations[next])!;
}

export function pressureAt(station: (typeof stations)[number], minute: number) {
  const value = station.values[Math.floor(minute) - station.start];
  return value == null ? null : (value * 33.8638867) / 1000;
}

export function signalStation(minute: number, selected?: (typeof stations)[number]) {
  const seen = (station: (typeof stations)[number]) =>
    minute >= station.peak && minute < station.peak + 44 && pressureAt(station, station.peak) !== null;
  return selected ? (seen(selected) ? selected : undefined) : stations.find(seen);
}

const shots = [
  { minute: 305, lon: ORIGIN.lon, lat: ORIGIN.lat, scale: 2.8, bank: -0.07 },
  { minute: 410, lon: -166, lat: -5, scale: 0.62, bank: 0 },
  { minute: 548, lon: -151, lat: 10, scale: 0.64, bank: 0 },
  { minute: 728, lon: -125, lat: 33, scale: 0.68, bank: 0.08 },
  { minute: 790, lon: -138, lat: 45, scale: 0.66, bank: 0 },
  { minute: 1000, lon: -66, lat: 34, scale: 0.65, bank: -0.13 },
  { minute: 1310, lon: ORIGIN.lon + 180, lat: -ORIGIN.lat, scale: 0.73, bank: 0 },
];

export function orbit(minute: number) {
  const next = shots.findIndex((shot) => minute < shot.minute);
  if (next < 1) return (next === 0 ? shots[0] : shots.at(-1))!;
  const a = shots[next - 1]!;
  const b = shots[next]!;
  const t = smooth((minute - a.minute) / (b.minute - a.minute));
  return {
    lon: mix(a.lon, b.lon, t),
    lat: mix(a.lat, b.lat, t),
    scale: mix(a.scale, b.scale, t),
    bank: mix(a.bank, b.bank, t),
  };
}

export type Vector = readonly [number, number, number];
export const waveOrigin = toVec3(ORIGIN.lon, ORIGIN.lat, 1);
export const antipode = toVec3(ORIGIN.lon + 180, -ORIGIN.lat, 1);

const lam = ORIGIN.lon * DEG;
const phi = ORIGIN.lat * DEG;
const east = [Math.cos(lam), 0, -Math.sin(lam)];
const north = [-Math.sin(phi) * Math.sin(lam), Math.cos(phi), -Math.sin(phi) * Math.cos(lam)];

export function wavePoint(angle: number, bearing: number): Vector {
  const radial = Math.cos(angle);
  const tangent = Math.sin(angle);
  const e = tangent * Math.sin(bearing);
  const n = tangent * Math.cos(bearing);
  return [
    waveOrigin[0] * radial + east[0]! * e + north[0]! * n,
    waveOrigin[1] * radial + east[1]! * e + north[1]! * n,
    waveOrigin[2] * radial + east[2]! * e + north[2]! * n,
  ];
}
