import tohoku from "./tohoku.json";

type Position = readonly number[];

const KM_PER_DEGREE = 111.195;
const CENTRE_LON = 141.65;
const CENTRE_LAT = 38.2;
const LON_SCALE = KM_PER_DEGREE * Math.cos((CENTRE_LAT * Math.PI) / 180);
export const DEPTH_EXAGGERATION = 4;

export interface Point {
  east: number;
  north: number;
  depth: number;
}

export function localPoint(lon: number, lat: number, depth = 0): Point {
  return { east: (lon - CENTRE_LON) * LON_SCALE, north: (lat - CENTRE_LAT) * KM_PER_DEGREE, depth };
}

export function geographicPoint(point: Point) {
  return { lon: CENTRE_LON + point.east / LON_SCALE, lat: CENTRE_LAT + point.north / KM_PER_DEGREE };
}

function fromPosition(position: Position): Point {
  return localPoint(position[0]!, position[1]!, position[2]);
}

export const epicenter = localPoint(tohoku.origin[0]!, tohoku.origin[1]!);
export const hypocenter = fromPosition(tohoku.hypocenter);
export const coast = tohoku.coast.map((polygon) => polygon.map((ring) => ring.map(fromPosition)));

export const faults = tohoku.mesh.map(({ corners, ...patch }) => ({
  ...patch,
  corners: corners.map(fromPosition),
}));
export const contours = tohoku.contours.map(({ lines, ...contour }) => ({
  ...contour,
  lines: lines.map((line) => line.map(fromPosition)),
}));

export const MODEL_SECONDS = Math.max(...faults.map(({ start, rise }) => start + rise));
export const ARRIVAL_MS = 1500;
const SLIP_MS = 5000;
const HOLD_MS = 650;
const LIFT_MS = 1600;
export const SHAKING_MS = ARRIVAL_MS + SLIP_MS + HOLD_MS;
export const REVEAL_MS = SHAKING_MS + LIFT_MS;

export const slipKey = [
  { from: 0, label: "0", color: "#345464" },
  { from: 5, label: "5", color: "#4e8792" },
  { from: 15, label: "15", color: "#6bb4b3" },
  { from: 30, label: "30", color: "#a3d4c8" },
  { from: 50, label: "50+", color: "#e5f2cd" },
];

export function slipColor(slip: number): string {
  for (let i = slipKey.length - 1; i > 0; i--) {
    if (slip >= slipKey[i]!.from) return slipKey[i]!.color;
  }
  return slipKey[0]!.color;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function patchProgress(time: number, start: number, rise: number): number {
  if (time < start) return 0;
  return rise === 0 ? 1 : clampUnit((time - start) / rise);
}

function ease(value: number): number {
  const t = clampUnit(value);
  return t * t * (3 - 2 * t);
}

export type View = "fault" | "shaking";

interface Camera {
  tilt: number;
  yaw: number;
  zoom: number;
  east: number;
  north: number;
}

const overview: Camera = { tilt: 0.13, yaw: 0.16, zoom: 0.81, east: -110, north: 10 };
const entry: Camera = { tilt: 0.97, yaw: -0.15, zoom: 1.42, east: -78, north: -75 };
const dive: Camera = { tilt: 0.78, yaw: 0.32, zoom: 1.51, east: -36, north: -68 };
const overhead: Camera = { tilt: 0, yaw: 0, zoom: 0.94, east: -66, north: -24 };

function move(from: Camera, to: Camera, at: number): Camera {
  const t = ease(at);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    tilt: mix(from.tilt, to.tilt),
    yaw: mix(from.yaw, to.yaw),
    zoom: mix(from.zoom, to.zoom),
    east: mix(from.east, to.east),
    north: mix(from.north, to.north),
  };
}

export interface RuptureFrame {
  camera: Camera;
  modelTime: number;
  reveal: number;
  depth: number;
}

export function stillFrame(view: View): RuptureFrame {
  return {
    camera: view === "fault" ? dive : overhead,
    modelTime: MODEL_SECONDS,
    reveal: view === "shaking" ? 1 : 0,
    depth: view === "fault" ? 1 : 0,
  };
}

export function revealFrame(ms: number): RuptureFrame {
  if (ms >= REVEAL_MS) return stillFrame("shaking");
  if (ms >= SHAKING_MS) {
    const t = (ms - SHAKING_MS) / LIFT_MS;
    return {
      camera: move(dive, overhead, t),
      modelTime: MODEL_SECONDS,
      reveal: ease((t - 0.23) / 0.77),
      depth: 1 - ease(t / 0.68),
    };
  }
  const slip = clampUnit((ms - ARRIVAL_MS) / SLIP_MS);
  return {
    camera: ms < ARRIVAL_MS ? move(overview, entry, ms / ARRIVAL_MS) : move(entry, dive, slip),
    modelTime: MODEL_SECONDS * slip,
    reveal: 0,
    depth: ease((ms - 450) / (ARRIVAL_MS - 450)),
  };
}
