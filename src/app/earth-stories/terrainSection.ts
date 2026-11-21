import type { GeoPoint, ObservationTerrain } from "../observations/types";
import { distanceKm } from "../../geo/sphere";
export type TerrainLine = readonly [GeoPoint, GeoPoint];
export const seafloorFlight: TerrainLine = [
  { lon: 148, lat: 17 },
  { lon: 142.2, lat: 11.35 },
];

export function sectionPoint(line: TerrainLine, fraction: number): GeoPoint {
  return {
    lon: line[0].lon + (line[1].lon - line[0].lon) * fraction,
    lat: line[0].lat + (line[1].lat - line[0].lat) * fraction,
  };
}

export function terrainSample(grid: ObservationTerrain, lon: number, lat: number) {
  const [west, south, east, north] = grid.bounds;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  const col = Math.round(((lon - west) / (east - west)) * (grid.columns - 1));
  const row = Math.round(((lat - south) / (north - south)) * (grid.rows - 1));
  const index = row * grid.columns + col;
  return { elevation: grid.elevation[index]!, tid: grid.tid[index]! };
}

export function terrainSource(code: number): string {
  const names: Record<number, string> = {
    0: "Land",
    10: "Single-beam sonar",
    11: "Multibeam sonar",
    12: "Seismic survey",
    13: "Isolated sounding",
    14: "Chart sounding",
    15: "Bathymetric lidar",
    16: "Optical depth measurement",
    17: "Combined direct measurements",
    40: "Inferred from satellite gravity",
    41: "Interpolated depth",
    42: "Chart contours",
    43: "Electronic chart contours",
    44: "Mixed measurements and gravity",
    45: "Inferred from airborne gravity",
    46: "Estimated from grounded iceberg",
    47: "Grounded Argo float",
    48: "Animal-borne instrument",
    70: "Mixed-source grid",
    71: "Unknown source",
    72: "Steering point",
  };
  return names[code] ?? `Source code ${code}`;
}

export function readTerrainSection(value: string | undefined, grid: ObservationTerrain): TerrainLine | null {
  if (!value?.startsWith("section:")) return null;
  if (value.split(":")[1] === "flight") return seafloorFlight;
  const parts = value.split(":")[1]!.split(",").map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const line: TerrainLine = [
    { lon: parts[0]!, lat: parts[1]! },
    { lon: parts[2]!, lat: parts[3]! },
  ];
  return line.every((point) => terrainSample(grid, point.lon, point.lat)) &&
    distanceKm(line[0].lon, line[0].lat, line[1].lon, line[1].lat) >= 1
    ? line
    : null;
}

export function sectionSamples(grid: ObservationTerrain, line: TerrainLine) {
  const length = distanceKm(line[0].lon, line[0].lat, line[1].lon, line[1].lat);
  return Array.from({ length: 101 }, (_, i) => {
    const p = i / 100;
    const { lon, lat } = sectionPoint(line, p);
    const cell = terrainSample(grid, lon, lat);
    return { lon, lat, km: p * length, meters: cell?.elevation ?? null, source: cell?.tid };
  });
}
