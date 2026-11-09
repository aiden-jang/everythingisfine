import { asset, date, point, type EarthStoryData, type StoryFrame } from "./types";

import { archive } from "./archive";

import radar from "../../sources/earth-stories/fault-radar.json";
import northData from "../../sources/earth-stories/north.json";

export async function faultStory(): Promise<EarthStoryData> {
  const data = await archive("fault");
  const first = Date.parse("2019-07-04T17:33:49Z");
  const second = Date.parse("2019-07-06T03:19:53Z");
  const lines = data.lines as [number, number[][]][];
  const paths = lines.map(([event, points]) => ({
    event,
    points: points.map((p) => ({ ...point(p), lift: 0.0095 })),
    color: event === 0 ? 0xe5ba76 : 0xa8dce9,
  }));
  const sites = ["6.4", "7.1"]
    .flatMap((event) =>
      [...data.points]
        .filter((p) => p.event === event)
        .sort((a, b) => b.cm - a.cm)
        .filter((p, index, points) =>
          points.slice(0, index).every((q) => Math.hypot(p.lon - q.lon, p.lat - q.lat) > 0.025),
        )
        .slice(0, 6),
    )
    .map((p) => ({
      id: p.id,
      label: `${p.feature || "Survey site"} · ${p.id}`,
      lon: p.lon,
      lat: p.lat,
      at: p.event === "6.4" ? first : second,
      value: `${(p.cm / 100).toFixed(2)} m ${p.sense.toLowerCase()} horizontal offset · surveyed ${p.observed}`,
    }));
  return {
    target: { lon: -117.57, lat: 35.78, zoom: 2.2 },
    lens: { globe: 17, map: 36 },
    frames: [
      {
        at: first,
        caption: "4 July · M6.4 surface rupture",
        raster: { url: asset("fault-relief.webp"), bounds: [-118.12, 35.2, -117.0, 36.2], opacity: 1 },
        flow: true,
        paths: paths.filter((p) => p.event === 0),
        marks: sites.filter((p) => p.at === first).map((p) => ({ ...p, size: 8, lift: 0.01 })),
      },
      {
        at: second,
        caption: "6 July UTC · M7.1 joins the fault system",
        raster: { url: asset("fault-relief.webp"), bounds: [-118.12, 35.2, -117.0, 36.2], opacity: 1 },
        flow: true,
        paths,
        marks: sites.map((p) => ({ ...p, size: 8, lift: 0.01 })),
      },
      {
        at: date("2019-07-08"),
        caption: "ALOS-2 radar · movement across both earthquakes",
        raster: {
          url: asset(radar.image),
          sweep: true,
          bounds: radar.bounds as [number, number, number, number],
          opacity: 0.95,
        },
        paths,
        marks: sites.map((p) => ({ ...p, size: 8, lift: 0.01 })),
        measurements: [{ label: "One radar color cycle", value: "11.45 cm in line of sight" }],
      },
    ],
    chapters: [
      { at: first, label: "M6.4" },
      { at: second, label: "M7.1" },
      { at: date("2019-07-08"), label: "Radar sweep" },
    ],
    sites,
    legend: [
      { color: "#e5ba76", label: "M6.4 rupture" },
      { color: "#a8dce9", label: "M7.1 rupture" },
    ],
  };
}

export async function fireStory(): Promise<EarthStoryData> {
  const data = await archive("fire");
  const detections = data.detections as number[][];
  const steps = [...new Set(detections.map((r) => r[0]!))];
  const first = new Map<string, number[]>();
  const frames: StoryFrame[] = [];
  let head = 0;
  for (const at of steps) {
    const current: number[][] = [];
    while (head < detections.length && detections[head]![0]! <= at) {
      const row = detections[head++]!;
      const key = `${row[1]!.toFixed(2)},${row[2]!.toFixed(2)}`;
      if (!first.has(key)) first.set(key, row);
      current.push(row);
    }
    frames.push({
      at,
      caption: "A satellite pass reveals detected heat",
      raster: { url: asset("fire-relief.webp"), bounds: [-121.7, 39.7, -120.2, 40.9], opacity: 1 },
      measurements: [
        { label: "Detections in this pass", value: current.length.toLocaleString() },
        {
          label: "Locations observed so far",
          value: `${first.size.toLocaleString()} · grouped at 0.01°`,
        },
      ],
    });
  }
  return {
    frames,
    geometry: (frame) => ({
      ...frame,
      marks: [...first.values()]
        .filter((r) => r[0]! <= frame.at)
        .map((r) => ({ lon: r[1]!, lat: r[2]!, lift: 0.0095, size: 3, color: 0x784e46 }))
        .concat(
          detections
            .filter((r) => r[0] === frame.at)
            .map((r) => ({ lon: r[1]!, lat: r[2]!, lift: 0.0095, size: 5, color: 0xffcc7b })),
        ),
    }),
    target: { lon: -120.9, lat: 40.25, zoom: 2.1 },
    lens: { globe: 13, map: 26 },
    chapters: [
      { at: frames[0]!.at, label: "First passes" },
      { at: date("2021-08-05"), label: "August" },
      { at: frames.at(-1)!.at, label: "Last pass" },
    ],
    legend: [
      { color: "#ffcc7b", label: "This satellite pass" },
      { color: "#784e46", label: "Previously detected heat" },
    ],
  };
}

export async function northStory(city: string): Promise<EarthStoryData> {
  const data = northData;
  const name = city in data.declination ? (city as keyof typeof data.declination) : "New York";
  const trail = data.poles.map((p) => point(p.slice(1)));
  const frames = data.poles.map(([year, lon, lat], i) => ({
    at: date(`${year}-01-01`),
    caption: `${year} · magnetic dip pole`,
    paths: [{ points: trail.slice(0, i + 1), color: 0xbbe1ed }],
    marks: [
      { lon: lon!, lat: lat!, size: 15, color: 0xd8f3fa },
      { lon: 0, lat: 90, size: 8, color: 0xebe8e1 },
    ],
    measurements: [
      {
        label: "Magnetic pole",
        value: `${lat!.toFixed(2)}° N · ${Math.abs(lon!).toFixed(2)}° ${lon! < 0 ? "W" : "E"}`,
      },
      {
        label: `${name} magnetic declination`,
        value: `${Math.abs(data.declination[name][i]!).toFixed(2)}° ${data.declination[name][i]! < 0 ? "west" : "east"}`,
      },
    ],
  }));
  return {
    frames,
    target: { lon: -90, lat: 77, zoom: 1.35 },
    chapters: [
      { at: frames[0]!.at, label: "1900" },
      { at: date("1970-01-01"), label: "1970" },
      { at: frames.at(-1)!.at, label: "2025" },
    ],
    series: [
      {
        label: `${name} declination · east positive`,
        samples: frames.map((f, i) => [f.at, data.declination[name][i]!] as const),
      },
    ],
    units: "°",
  };
}
