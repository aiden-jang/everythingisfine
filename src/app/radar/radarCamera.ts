import { RADAR_BOUNDS } from "../../sources/radar";

export interface RadarCamera {
  lon: number;
  lat: number;
  span: number;
  roll: number;
  pitch: number;
}

export const national: RadarCamera = { lon: -95.5, lat: 37, span: 58, roll: 0, pitch: 1 };

export const radarRegions = [
  { id: "pacific", name: "Pacific", lon: -120, lat: 41, span: 18 },
  { id: "west", name: "Mountain West", lon: -110, lat: 40, span: 20 },
  { id: "plains", name: "Great Plains", lon: -99, lat: 39, span: 21 },
  { id: "lakes", name: "Great Lakes", lon: -86, lat: 43, span: 21 },
  { id: "south", name: "South", lon: -91, lat: 31, span: 23 },
  { id: "northeast", name: "Northeast", lon: -75, lat: 42.5, span: 20 },
] as const;

export type RadarRegion = (typeof radarRegions)[number];

export function regionCamera(region: RadarRegion | undefined): RadarCamera {
  return region ? { lon: region.lon, lat: region.lat, span: region.span, roll: 0, pitch: 1 } : national;
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

export function radarFlight(from: RadarCamera, to: RadarCamera, progress: number): RadarCamera {
  const t = progress * progress * (3 - 2 * progress);
  const bank = Math.sin(Math.PI * t);
  return {
    lon: from.lon + (to.lon - from.lon) * t,
    lat: from.lat + (to.lat - from.lat) * t,
    span: from.span + (to.span - from.span) * t,
    roll: from.roll * (1 - t) - bank * 0.22,
    pitch: from.pitch + (to.pitch - from.pitch) * t - bank * 0.24,
  };
}
