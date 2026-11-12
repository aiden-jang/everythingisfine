import type { ObservationFrame } from "../observations/types";
import { RADAR_BOUNDS } from "../../sources/radar";
import type { RadarFeedHealth } from "./radarFeedHealth";

interface RadarCamera {
  lon: number;
  lat: number;
  zoom: number;
}

export interface RadarView {
  region?: string;
  kind: "radar";
  target: RadarCamera;
  image: ImageBitmap | null;
  at?: number | undefined;
  lightning?: ObservationFrame | undefined;
  feed?: RadarFeedHealth | undefined;
}

export type RadarLayerView = Pick<RadarView, "image" | "at" | "region"> & { kind: "radar-layer" };

export const national: RadarCamera = { lon: -95.5, lat: 37, zoom: 1.45 };

export const radarRegions = [
  { id: "pacific", name: "Pacific", lon: -120, lat: 41, span: 18 },
  { id: "west", name: "Mountain West", lon: -110, lat: 40, span: 20 },
  { id: "plains", name: "Great Plains", lon: -99, lat: 39, span: 21 },
  { id: "lakes", name: "Great Lakes", lon: -86, lat: 43, span: 21 },
  { id: "south", name: "South", lon: -91, lat: 31, span: 23 },
  { id: "northeast", name: "Northeast", lon: -75, lat: 42.5, span: 20 },
] as const;

export const globalRadarRegions = [
  { id: "world", name: "World", lon: 0, lat: 20, zoom: 1 },
  { id: "europe", name: "Europe", lon: 15, lat: 50, zoom: 1.75 },
  { id: "asia", name: "East Asia", lon: 127, lat: 34, zoom: 1.75 },
  { id: "oceania", name: "Oceania", lon: 145, lat: -30, zoom: 1.5 },
  { id: "americas", name: "Americas", lon: -85, lat: 15, zoom: 1.45 },
  { id: "africa", name: "Africa", lon: 20, lat: 0, zoom: 1.5 },
] as const;

export const isGlobalRadar = (region?: string) =>
  region === undefined || globalRadarRegions.some(({ id }) => id === region);

export function radarCamera(region?: string): RadarCamera {
  return (
    globalRadarRegions.find(({ id }) => id === (region ?? "world")) ??
    regionCamera(radarRegions.find(({ id }) => id === region))
  );
}

export type RadarRegion = (typeof radarRegions)[number];

export function regionCamera(region: RadarRegion | undefined): RadarCamera {
  return region ? { lon: region.lon, lat: region.lat, zoom: 2.55 } : national;
}

export function strongestRegion(image: ImageBitmap): RadarRegion | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = 168;
  canvas.height = 75;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const [west, south, east, north] = RADAR_BOUNDS;
  let best: RadarRegion | undefined;
  let score = 0.002;
  for (const region of radarRegions) {
    let total = 0;
    let colored = 0;
    for (let y = 0; y < canvas.height; y++) {
      const lat = north - ((y + 0.5) * (north - south)) / canvas.height;
      if (Math.abs(lat - region.lat) > region.span * 0.35) continue;
      for (let x = 0; x < canvas.width; x++) {
        const lon = west + ((x + 0.5) * (east - west)) / canvas.width;
        if (Math.abs(lon - region.lon) > region.span * 0.48) continue;
        total++;
        if (rgba[(y * canvas.width + x) * 4 + 3]! > 127) colored++;
      }
    }
    const density = colored / total;
    if (density > score) {
      score = density;
      best = region;
    }
  }
  return best;
}
