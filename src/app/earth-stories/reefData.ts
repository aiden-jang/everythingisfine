import { NetCDFReader } from "netcdfjs";
import type { EarthStoryData } from "./types";
import { reefArchive } from "./atlasOcean";

const stops = [0, 4, 8, 12, 20];
const colors = [
  [30, 67, 93],
  [244, 211, 126],
  [223, 122, 77],
  [173, 61, 86],
  [111, 62, 119],
];

export function heatColor(value: number): readonly number[] {
  if (!Number.isFinite(value) || value < 0 || value > 100) return [0, 0, 0, 0];
  let upper = stops.findIndex((stop) => stop >= value);
  if (upper < 0) upper = stops.length - 1;
  const lower = Math.max(0, upper - 1);
  const t = upper === lower ? 0 : Math.min(1, (value - stops[lower]!) / (stops[upper]! - stops[lower]!));
  return [...colors[lower]!.map((c, i) => Math.round(c + (colors[upper]![i]! - c) * t)), 230];
}

export function parseReefTemperatures(csv: string): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of csv.trim().split("\n").slice(2)) {
    const values = row.split(",");
    const at = Date.parse(values[0] ?? ""),
      value = parseFloat(values[3] ?? "");
    if (values.length === 4 && Number.isFinite(at) && Number.isFinite(value) && value >= -3 && value < 45)
      result.set(at, value);
  }
  return result;
}

async function recentTemperatures(): Promise<Map<number, number>> {
  try {
    const response = await fetch("/api/observations/reef-temperature", {
      signal: AbortSignal.timeout(25000),
    });
    return response.ok ? parseReefTemperatures(await response.text()) : new Map();
  } catch {
    return new Map();
  }
}

export function parseReef(buffer: ArrayBuffer) {
  const grid = new NetCDFReader(buffer);
  const read = (name: string) => grid.getDataVariable(name).map(Number);
  const times = read("time"),
    lat = read("latitude"),
    lon = read("longitude"),
    values = read("degree_heating_week");
  if (
    times.length < 2 ||
    lat.length < 20 ||
    lon.length < 20 ||
    values.length !== times.length * lat.length * lon.length
  )
    throw new Error("Incomplete heat-stress observations");
  const nearest = (axis: number[], value: number) =>
    axis.reduce((best, p, i) => (Math.abs(p - value) < Math.abs(axis[best]! - value) ? i : best), 0);
  const keys = nearest(lat, 24.4) * lon.length + nearest(lon, -81.4);
  const halfX = Math.abs(lon[1]! - lon[0]!) / 2,
    halfY = Math.abs(lat[1]! - lat[0]!) / 2;
  return {
    bounds: [lon[0]! - halfX, lat.at(-1)! - halfY, lon.at(-1)! + halfX, lat[0]! + halfY] as [
      number,
      number,
      number,
      number,
    ],
    columns: lon.length,
    rows: lat.length,
    frames: times.map((t, i) => {
      const field = values.slice(i * lat.length * lon.length, (i + 1) * lat.length * lon.length);
      const value = field[keys]!;
      return {
        at: t * 1000,
        values: field,
        keys: Number.isFinite(value) && value >= 0 && value <= 100 ? value : null,
      };
    }),
  };
}

export async function reefStory(choice: string): Promise<EarthStoryData> {
  if (choice === "2023 archive") return reefArchive();
  const [response, temperatures] = await Promise.all([
    fetch("/api/observations/reef", { signal: AbortSignal.timeout(25000) }),
    recentTemperatures(),
  ]);
  if (!response.ok) throw new Error("Recent reef observations unavailable");
  const data = parseReef(await response.arrayBuffer());
  const canvas = document.createElement("canvas");
  canvas.width = data.columns;
  canvas.height = data.rows;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Heat map could not be prepared");
  const frames = data.frames.map((f) => {
    const pixels = context.createImageData(data.columns, data.rows);
    f.values.forEach((value, i) => pixels.data.set(heatColor(value), i * 4));
    context.putImageData(pixels, 0, 0);
    return {
      at: f.at,
      caption: "Recent satellite-derived heat stress · not a bleaching survey",
      raster: { url: canvas.toDataURL("image/png"), bounds: data.bounds },
      marks: [{ lon: -81.4, lat: 24.4, color: 0xf1dfad, size: 8 }],
      measurements: [
        {
          label: "Florida Keys · heat stress",
          value: f.keys === null ? "No observation" : `${f.keys.toFixed(1)} °C-weeks`,
        },
        {
          label: "Florida Keys · sea surface temperature",
          value: temperatures.has(f.at) ? `${temperatures.get(f.at)!.toFixed(1)} °C` : "No observation",
        },
      ],
    };
  });
  return {
    frames,
    target: { lon: -77, lat: 24, zoom: 1.8 },
    lens: { globe: 1.5, map: 3 },
    chapters: [
      { at: frames[0]!.at, label: "Seven weeks earlier" },
      { at: frames.at(-1)!.at, label: "Latest in this window" },
    ],
    units: "°C-weeks",
    series: [
      {
        label: "Florida Keys · sampled offshore pixel",
        samples: data.frames.flatMap((f) => (f.keys === null ? [] : [[f.at, f.keys] as const])),
      },
    ],
    legend: [
      { color: "#f4d37e", label: "4 °C-weeks" },
      { color: "#df7a4d", label: "8" },
      { color: "#ad3d56", label: "12" },
      { color: "#6f3e77", label: "20" },
    ],
  };
}
