import type { SkyCity } from "../../geo/tonight";
import { atlasArchive, atlasImage } from "./atlasArchive";
import { date, type EarthStoryData, type StoryFrame } from "./types";

type Bounds = [number, number, number, number];
type RasterFrame = {
  day: string;
  image: string | null;
  natural?: string | null;
  end?: string;
  keys?: number | null;
  sst?: number | null;
};
type RasterArchive = { bounds: Bounds; frames: RasterFrame[] };
const chapters = (frames: readonly StoryFrame[], labels: readonly string[]) =>
  labels.map((label, i) => ({
    label,
    at: frames[Math.round((i * (frames.length - 1)) / (labels.length - 1))]!.at,
  }));

export async function bloomStory(choice: string): Promise<EarthStoryData> {
  const data = await atlasArchive<RasterArchive>("bloom");
  const frames = data.frames.map((f): StoryFrame => {
    const image = choice === "Natural color" ? f.natural : f.image;
    return {
      at: date(f.day),
      caption: image ? `${choice} · Aqua MODIS observation` : "No usable satellite coverage on this date",
      ...(image ? { raster: { url: atlasImage(image), bounds: data.bounds } } : {}),
      measurements: [
        {
          label: "Observation coverage",
          value: image ? "Cloud and swath gaps remain blank" : "Unavailable · not a zero reading",
        },
      ],
    };
  });
  return {
    frames,
    target: { lon: -23, lat: 52, zoom: 1.6 },
    chapters: chapters(frames, ["April", "May", "June"]),
    legend:
      choice === "Natural color"
        ? []
        : [
            { color: "#1735ce", label: "Lower chlorophyll" },
            { color: "#40bb63", label: "Higher chlorophyll" },
          ],
  };
}

export async function springStory(choice: string, city: SkyCity): Promise<EarthStoryData> {
  const data = await atlasArchive<RasterArchive>("spring");
  const frames = data.frames
    .filter((f) => f.day.startsWith(choice))
    .map((f): StoryFrame => ({
      at: date(f.day),
      caption: `${f.day} to ${f.end} · 16-day vegetation composite`,
      ...(f.image ? { raster: { url: atlasImage(f.image), bounds: data.bounds } } : {}),
      marks: [{ lon: city.lon, lat: city.lat, color: 0xf1dfad, size: 9 }],
      measurements: [
        { label: "Pinned place", value: city.name },
        { label: "Observation window", value: `${f.day} – ${f.end}` },
      ],
    }));
  return {
    frames,
    target: { lon: city.lon, lat: city.lat, zoom: 1.05 },
    chapters: chapters(frames, ["January", "April", "August", "December"]),
    legend: [
      { color: "#d9c6a2", label: "Lower greenness" },
      { color: "#3a7525", label: "Higher greenness" },
    ],
  };
}

export async function aralStory(): Promise<EarthStoryData> {
  const data = await atlasArchive<{
    bounds: Bounds;
    frames: { year: number; image: string; missing: number }[];
  }>("aral");
  const frames = data.frames.map((f): StoryFrame => ({
    at: date(`${f.year}-06-01`),
    timeLabel: `${f.year} · annual water classification`,
    caption: "The early water boundary stays in place as the sea retreats",
    raster: { url: atlasImage(f.image), bounds: data.bounds },
    measurements: [{ label: "Missing observations inside reference", value: `${f.missing}%` }],
  }));
  return {
    frames,
    target: { lon: 59.5, lat: 45, zoom: 2 },
    lens: { globe: 5, map: 10 },
    chapters: chapters(frames, ["Early shoreline", "Separating basins", "Recent archive"]),
    legend: [
      { color: "#e6e1c5", label: "1984–1986 observed-water boundary" },
      { color: "#3987b2", label: "Permanent water" },
      { color: "#70c0cb", label: "Seasonal water" },
    ],
  };
}

export async function reefArchive(): Promise<EarthStoryData> {
  const data = await atlasArchive<RasterArchive>("reef");
  const frames = data.frames.map((f): StoryFrame => ({
    at: date(f.day),
    caption: "2023 archived heat stress · not a bleaching survey",
    ...(f.image ? { raster: { url: atlasImage(f.image), bounds: data.bounds } } : {}),
    marks: [{ lon: -81.4, lat: 24.4, color: 0xf1dfad, size: 8 }],
    measurements: [
      {
        label: "Florida Keys · heat stress",
        value: f.keys == null ? "No observation" : `${f.keys.toFixed(1)} °C-weeks`,
      },
      {
        label: "Florida Keys · sea surface temperature",
        value: f.sst == null ? "No observation" : `${f.sst.toFixed(1)} °C`,
      },
    ],
  }));
  return {
    frames,
    target: { lon: -77, lat: 24, zoom: 1.8 },
    lens: { globe: 1.5, map: 3 },
    chapters: chapters(frames, ["June", "August", "October"]),
    units: "°C-weeks",
    series: [
      {
        label: "Florida Keys · sampled offshore pixel",
        samples: data.frames.flatMap((f) => (f.keys == null ? [] : [[date(f.day), f.keys] as const])),
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

export async function ninoStory(): Promise<EarthStoryData> {
  type BuoyFrame = { day: string; image: string; observations: [number, number, number, number][] };
  const data = await atlasArchive<{ frames: BuoyFrame[] }>("nino");
  const wrap = (lon: number) => ((lon + 540) % 360) - 180;
  const frames = data.frames.map((f): StoryFrame => ({
    at: date(f.day),
    timeLabel: `${f.day.slice(0, 7)} · monthly mean`,
    caption: "1–501 m depth · exaggerated 4,000×",
    section: {
      image: atlasImage(f.image),
      points: Array.from({ length: 71 }, (_, i) => ({ lon: wrap(130 + i * 2), lat: 0 })),
      heightKm: 0.5,
      exaggeration: 4000,
      label: "1–501 m · depth exaggerated 4,000×",
    },
    marks: [...new Set(f.observations.map((o) => o[0]))].map((lon) => ({
      lon: wrap(lon),
      lat: 0,
      size: 7,
      color: 0xeee8cd,
    })),
    measurements: [
      {
        label: "Moorings with usable monthly means",
        value: String(new Set(f.observations.map((o) => o[0])).size),
      },
      { label: "Quality screening", value: "Highest / standard · ≥10 readings per depth" },
      { label: "Section", value: "Surface at top. Color between moorings is interpolated; gaps stay blank." },
    ],
  }));
  return {
    frames,
    target: { lon: -160, lat: 15, zoom: 1.1 },
    chapters: chapters(frames, ["Early 1997", "Warm layer shifts", "Late 1998"]),
    legend: [
      { color: "#1e3971", label: "8°C" },
      { color: "#67bcb7", label: "20°C" },
      { color: "#c0492f", label: "31°C" },
    ],
  };
}
