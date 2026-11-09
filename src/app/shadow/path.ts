import type { ObservationPath } from "../observations/types";
import { limits, samples } from "./pathData";

export const chaseStart = Date.UTC(2027, 7, 2, 8, 26);
export const sampleInterval = 120_000;
export const chaseEnd = chaseStart + (samples.length - 1) * sampleInterval;
export const luxor = { name: "Luxor", lat: 25.6872, lon: 32.6396, zone: "Africa/Cairo" } as const;

const point = (lat: number, lon: number) => ({ lat, lon, lift: 0.009 });
const edge = [limits[0]!, ...samples, limits[1]!];
export const totalityPath: readonly ObservationPath[] = [
  { points: edge.map(([lat, lon]) => point(lat, lon)), color: 0xb7a88e },
  {
    points: edge.flatMap(([, , lat, lon]) => (lat === null || lon === null ? [] : [point(lat, lon)])),
    color: 0xd9bf97,
  },
  { points: edge.map(([, , , , lat, lon]) => point(lat, lon)), color: 0xd9bf97 },
];

export function shadowAt(at: number) {
  const position = Math.max(0, Math.min(samples.length - 1, (at - chaseStart) / sampleInterval));
  const i = Math.floor(position);
  const a = samples[i]!;
  const b = samples[i + 1] ?? a;
  const f = position - i;
  return {
    lat: a[0] + (b[0] - a[0]) * f,
    lon: a[1] + (b[1] - a[1]) * f,
    width: a[6] + (b[6] - a[6]) * f,
    duration: a[7] + (b[7] - a[7]) * f,
  };
}

export function chasePose(at: number) {
  const { lon, lat } = shadowAt(at);
  const progress = (at - chaseStart) / (chaseEnd - chaseStart);
  return { lon: lon + 10, lat: lat + 8, zoom: 1.04 + 0.35 * Math.sin(Math.PI * progress) };
}

export const chaseOverview = { lon: 24, lat: 22, zoom: 0.9 };

export function durationLabel(seconds: number) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}
