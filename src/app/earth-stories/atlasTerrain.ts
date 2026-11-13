import type { ObservationTerrain } from "../observations/types";
import { atlasArchive, atlasImage } from "./atlasArchive";
import { date, point, type EarthStoryData, type StoryFrame } from "./types";

import { terrainSample, terrainSource } from "./terrainSection";

export async function seafloorStory(): Promise<EarthStoryData> {
  const grid = await atlasArchive<ObservationTerrain & { image: string }>("seafloor");
  const frames = Array.from({ length: 121 }, (_, i): StoryFrame => {
    const progress = i / 120;
    const lon = 148 - 5.8 * progress,
      lat = 17 - 5.65 * progress;
    const reading = terrainSample(grid, lon, lat)!;
    return {
      at: date("2026-01-01") + i,
      sequence: true,
      timeLabel: `${Math.round(progress * 100)}% · ${i < 35 ? "Across the Pacific" : i < 95 ? "Into the trench" : "Challenger Deep region"}`,
      caption: "GEBCO 2026 terrain · an authored flight over the measured and inferred seafloor",
      marks: [{ lon, lat, lift: 0.072, size: 9, color: 0xe8e4bd }],
      raster: { url: atlasImage(grid.image), bounds: grid.bounds, opacity: 0.9 },
      measurements: [
        { label: "Sampled seafloor elevation", value: `${reading.elevation.toLocaleString()} m` },
        { label: "Depth source", value: terrainSource(reading.tid) },
        { label: "Relief", value: "30× exaggerated · lifted cutaway" },
      ],
    };
  });
  return {
    frames,
    terrain: grid,
    timelineLabel: "Flight progress",
    target: { lon: 144.6, lat: 13.5, zoom: 1.8 },
    lens: { globe: 3.6, map: 7 },
    chapters: [
      { at: frames[0]!.at, label: "Pacific" },
      { at: frames[50]!.at, label: "Trench" },
      { at: frames[120]!.at, label: "Challenger Deep" },
    ],
    legend: [
      { color: "#143358", label: "8 km deep" },
      { color: "#245e74", label: "5 km" },
      { color: "#4f9999", label: "2 km" },
    ],
  };
}

export async function glacierStory(choice: string): Promise<EarthStoryData> {
  type Glacier = {
    year: number;
    image: string;
    paths: number[][][];
    maxVelocity: number;
    medianError: number;
  };
  const data = await atlasArchive<{ bounds: [number, number, number, number]; frames: Glacier[] }>("glacier");
  const selected = data.frames.find((f) => String(f.year) === choice)!;
  const paths = selected.paths.map((points) => ({ points: points.map(point), color: 0xddebf0 }));
  const frames = Array.from({ length: 49 }, (_, i): StoryFrame => ({
    at: date(`${choice}-01-01`) + i,
    sequence: true,
    timeLabel: `${choice} mean velocity · ${Math.round((i / 48) * 100)}% of illustrative trace`,
    caption: "A year of motion through the annual mean field · illustrative trajectories",
    raster: { url: atlasImage(selected.image), bounds: data.bounds },
    paths: paths.map((path) => ({
      ...path,
      points: path.points.slice(0, Math.max(2, Math.ceil((path.points.length * i) / 48))),
    })),
    flow: true,
    measurements: [
      { label: "Fastest sampled ice", value: `${selected.maxVelocity.toLocaleString()} m/year` },
      { label: "Median error · moving ice ≥150 m/year", value: `${selected.medianError} m/year` },
      { label: "Annual observation window", value: `${choice} · not a forecast` },
    ],
  }));
  return {
    frames,
    timelineLabel: "Trace progress",
    target: { lon: -49.55, lat: 69.15, zoom: 2 },
    lens: { globe: 37, map: 74 },
    chapters: [
      { at: frames[0]!.at, label: "Ice sheet" },
      { at: frames[24]!.at, label: "Flowing seaward" },
      { at: frames[48]!.at, label: "Full trace" },
    ],
    legend: [
      { color: "#295d7c", label: "500 m/year" },
      { color: "#48a1ab", label: "2,000" },
      { color: "#f6cb7c", label: "12,000" },
    ],
  };
}
