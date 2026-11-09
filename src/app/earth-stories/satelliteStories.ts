import type { EarthStoryData, StoryFrame } from "./types";
import { asset, date } from "./types";

import { archive } from "./archive";

import dustData from "../../sources/earth-stories/dust.json";
import ozoneData from "../../sources/earth-stories/ozone.json";
import waterData from "../../sources/earth-stories/water.json";
import readings from "../../sources/earth-stories/water-readings.json";
import climatology from "../../sources/earth-stories/ice-climatology.json";

type ImageFrame = { day: string; image: string | null; extent?: number; area?: number };
const chapters = (frames: readonly StoryFrame[], labels: readonly string[]) =>
  labels.map((label, i) => ({
    label,
    at: frames[Math.round((i * (frames.length - 1)) / (labels.length - 1))]!.at,
  }));

export async function satelliteStory(
  id: "dust" | "ice" | "ozone" | "water",
  choice: string,
): Promise<EarthStoryData> {
  let frames: StoryFrame[];
  if (id === "dust") {
    const data = dustData;
    frames = data.frames
      .filter((f) => f.image)
      .map((f) => ({
        at: date(f.day),
        caption:
          f.day <= "2020-06-20"
            ? "Off the African coast"
            : f.day <= "2020-06-24"
              ? "Across the Caribbean"
              : "Into the Gulf",
        raster: {
          url: asset(f.image!),
          bounds: data.bounds as [number, number, number, number],
          opacity: 0.85,
        },
      }));
    return {
      frames,
      target: { lon: -47, lat: 22, zoom: 1.35 },
      chapters: chapters(frames, ["Atlantic", "Caribbean", "Gulf"]),
      legend: [
        { color: "#a1b579", label: "Dust score · 425" },
        { color: "#f2782d", label: "475" },
        { color: "#881226", label: "500+" },
      ],
    };
  }
  if (id === "ice") {
    const data = await archive("ice");
    const medians = new Map(climatology.slice(2).map((r) => [Number(r[0]), Number(r[5])]));
    const median = (day: string) => medians.get(Math.floor((date(day) - date("2012-01-01")) / 86400000) + 1)!;
    frames = data.frames.map((f) => ({
      at: date(f.day),
      caption:
        f.day < "2012-06-01"
          ? "The spring ice edge"
          : f.day < "2012-09-01"
            ? "Summer retreat"
            : "Approaching the minimum",
      raster: { url: asset(f.image), bounds: data.bounds as [number, number, number, number] },
      paths: f.median.map((line) => ({
        points: line.map(([lon, lat]) => ({ lon: lon!, lat: lat!, lift: 0.012 })),
        color: 0xf1c67a,
      })),
      measurements: [
        { label: "Sea-ice extent", value: `${f.extent!.toFixed(2)} million km²` },
        { label: "1981–2010 median, same date", value: `${median(f.day).toFixed(2)} million km²` },
      ],
    }));
    return {
      frames,
      target: { lon: -35, lat: 76, zoom: 1.25 },
      chapters: chapters(frames, ["Spring", "Summer", "Minimum"]),
      units: "million km²",
      series: [
        { label: "2012", samples: data.frames.map((f) => [date(f.day), f.extent!] as const) },
        { label: "1981–2010 median", samples: data.frames.map((f) => [date(f.day), median(f.day)] as const) },
      ],
      legend: [
        { color: "#b4ddf2", label: "Sea-ice extent ≥15% concentration" },
        { color: "#f1c67a", label: "1981–2010 median edge · same date" },
      ],
    };
  }
  if (id === "ozone") {
    const data = ozoneData;
    const year = choice === "2019" ? "2019" : "2006";
    const selected: ImageFrame[] = data.seasons[year];
    frames = selected
      .filter((f) => f.image)
      .map((f) => ({
        at: date(f.day),
        caption: `${year} Antarctic ozone season`,
        raster: { url: asset(f.image!), bounds: data.bounds as [number, number, number, number] },
        measurements: [
          {
            label: "Ozone-hole area",
            value:
              f.area !== undefined && f.area >= 0 ? `${f.area.toFixed(2)} million km²` : "No area estimate",
          },
        ],
      }));
    return {
      frames,
      target: { lon: 15, lat: -76, zoom: 1.25 },
      chapters: chapters(frames, ["August", "October", "November"]),
      legend: [
        { color: "#3288bd", label: "100 DU" },
        { color: "#abdda4", label: "220 DU · hole threshold" },
        { color: "#fdae61", label: "400 DU" },
      ],
      units: "million km²",
      series: [
        {
          label: `${year} ozone-hole area`,
          samples: selected
            .filter((f) => f.area !== undefined && f.area >= 0)
            .map((f) => [date(f.day), f.area!] as const),
        },
      ],
    };
  }
  const data = waterData;
  const region = choice in readings ? (choice as keyof typeof readings) : "California";
  const samples = readings[region].data.flat().map((r) => ({ at: r.time * 1000, mean: r.mean }));
  const box = readings[region].meta[0]!.bounds;
  const outline = [
    { lon: box.west, lat: box.south },
    { lon: box.east, lat: box.south },
    { lon: box.east, lat: box.north },
    { lon: box.west, lat: box.north },
    { lon: box.west, lat: box.south },
  ];
  frames = data.frames.flatMap((f) => {
    const measured = samples.find((s) => new Date(s.at).toISOString().slice(0, 7) === f.day.slice(0, 7));
    return measured
      ? [
          {
            at: measured.at,
            caption:
              f.day < "2012"
                ? "Before the drought"
                : f.day < "2017"
                  ? "Water storage falls"
                  : "A wetter winter",
            raster: { url: asset(f.image!), bounds: data.bounds as [number, number, number, number] },
            paths: [{ points: outline, color: 0xf0f2ed }],
            measurements: [
              {
                label: `${region} land-cell mean`,
                value: `${measured.mean > 0 ? "+" : ""}${measured.mean.toFixed(1)} cm`,
              },
            ],
          },
        ]
      : [];
  });
  return {
    frames,
    target: { lon: -119.5, lat: 37, zoom: 1.9 },
    lens: { globe: 2, map: 4 },
    chapters: [
      { at: frames[0]!.at, label: "2011" },
      { at: date("2015-08-01"), label: "Drought" },
      { at: frames.at(-1)!.at, label: "2017" },
    ],
    series: [
      {
        label: `${region} total water storage`,
        samples: frames.map((f) => [f.at, Number(f.measurements![0]!.value.replace(" cm", ""))] as const),
      },
    ],
    units: "cm",
    legend: [
      { color: "#0033ff", label: "Less water · −30 cm" },
      { color: "#fefbfd", label: "2004–2009 baseline" },
      { color: "#ff3300", label: "More water · +30 cm" },
    ],
  };
}
