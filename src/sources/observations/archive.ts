import type { ObservationSource } from "../../app/observations/types";
import { HOUR, sampleAt } from "./common";
import scans from "./smoke-scans.json";
import buoys from "./tsunami-readings.json";

const images = import.meta.glob<string>("./archive-assets/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const asset = (name: string) => images[`./archive-assets/${name}.webp`]!;
const SMOKE_BOUNDS = [-91, 34, -60, 55] as const;

const smokeCities = [
  { id: "region", label: "Northeastern United States", lon: -76, lat: 43, zoom: 2.35 },
  { id: "quebec", label: "Québec City", lon: -71.208, lat: 46.8139, zoom: 2.85 },
  { id: "new-york", label: "New York", lon: -74.006, lat: 40.7128, zoom: 2.85 },
  { id: "philadelphia", label: "Philadelphia", lon: -75.164, lat: 39.9526, zoom: 2.85 },
] as const;

export const smoke: ObservationSource = {
  options: smokeCities,
  async load(option) {
    const city = smokeCities.find(({ id }) => id === option) ?? smokeCities[0];
    return {
      target: city,
      frames: scans.map(([at], index) => ({
        at: Number(at),
        raster: { url: asset(`smoke-${index}`), bounds: SMOKE_BOUNDS, opacity: 0.95 },
        marks: [
          { lon: -74.006, lat: 40.7128, size: 14 },
          { lon: -71.208, lat: 46.8139, size: 11 },
          { lon: -75.164, lat: 39.9526, size: 9 },
        ],
        measurements: [{ label: "Instrument", value: "GOES-16 ABI" }],
      })),
      note: "Recorded June 6–8, 2023. The five frames combine observed red, blue and near-infrared channels. The image shows the plume from above.",
    };
  },
};

const EARTHQUAKE = Date.UTC(2010, 1, 27, 6, 34, 11);
const EPICENTRE = { lon: -72.898, lat: -36.122, zoom: 2.4 };

export const tsunami: ObservationSource = {
  options: buoys.map(({ id, name }) => ({ id, label: `DART ${id} · ${name}` })),
  async load(option) {
    const chosen = buoys.find(({ id }) => id === option) ?? buoys[0]!;
    const series = chosen.values.map(
      ([seconds, residual]) => [EARTHQUAKE + seconds! * 1000, residual!] as const,
    );
    return {
      target: { lon: -117, lat: -12, zoom: 1.2 },
      frames: Array.from({ length: 25 }, (_, hour) => {
        const at = EARTHQUAKE + hour * HOUR;
        const actual = sampleAt(series, at);
        return {
          at,
          ...(hour <= 1 ? { camera: EPICENTRE } : {}),
          raster: { url: asset(`tsunami-${hour}`) },
          marks: [
            { lon: -72.898, lat: -36.122, size: 20, color: 0xffd09c },
            ...buoys.map((point) => ({
              ...point,
              size: chosen.id === point.id ? 22 : 12,
              color: chosen.id === point.id ? 0x9de8ec : 0x8a9bb4,
            })),
          ],
          measurements: [
            { label: "Since the earthquake", value: `${hour} h` },
            {
              label: "Recorded at selected buoy",
              value:
                actual && Math.abs(actual[0] - at) <= 900_000
                  ? `${actual[1].toFixed(3)} m`
                  : "No sample nearby",
            },
          ],
        };
      }),
      units: "m",
      series: [{ label: `DART ${chosen.id} · observed residual`, samples: series }],
      note: "Illustrative first-arrival model calculated from NOAA ETOPO bathymetry. The glowing front shows estimated travel time. The gauge plot uses separate NOAA DART observations after tide removal.",
    };
  },
};
