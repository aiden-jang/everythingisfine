import { gmstDeg } from "../../geo/stars";
import { toVec3, EARTH_RADIUS_KM } from "../../geo/sphere";
import { horizontal, aimAt, skyBodies, type SkyCity, type TonightView } from "../../geo/tonight";
import { sunElevation } from "../../geo/sun";
import type { GeoPoint } from "../observations/types";
import { atlasArchive } from "./atlasArchive";
import type { EarthStoryData, StoryFrame } from "./types";
import moonTexture from "../../sources/moonfall/recordings/moon.webp?url";

type Sample = [number, number, number, number, number];
const AU = 149597870.7;
const wrap = (lon: number) => ((lon + 540) % 360) - 180;

export function ephemerisPoint(sample: Sample): GeoPoint {
  return {
    lon: wrap(sample[1] - gmstDeg(sample[0])),
    lat: sample[2],
    lift: (sample[3] * AU) / EARTH_RADIUS_KM - 1,
  };
}

export function lunarHorizon(point: GeoPoint): GeoPoint[] {
  const latitude = (point.lat * Math.PI) / 180,
    longitude = (point.lon * Math.PI) / 180;
  const angle = Math.acos(1 / (1 + (point.lift ?? 0)));
  return Array.from({ length: 181 }, (_, i) => {
    const bearing = (i * Math.PI) / 90;
    const lat = Math.asin(
      Math.sin(latitude) * Math.cos(angle) + Math.cos(latitude) * Math.sin(angle) * Math.cos(bearing),
    );
    const lon =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angle) * Math.cos(latitude),
        Math.cos(angle) - Math.sin(latitude) * Math.sin(lat),
      );
    return { lon: wrap((lon * 180) / Math.PI), lat: (lat * 180) / Math.PI };
  });
}

function citySky(city: SkyCity, sample: Sample, name: string): TonightView {
  const point = ephemerisPoint(sample);
  const body = {
    ...horizontal(city, point, 1 + point.lift!),
    name,
    magnitude: name === "Moon" ? -12 : 3,
    lit: name === "Moon" ? 100 : null,
  };
  return {
    kind: "tonight",
    at: sample[0],
    city,
    look: aimAt(body),
    targetName: name,
    bodies: [...skyBodies(city, sample[0]).filter((b) => b.name !== name), body],
  };
}

function sampleAt(samples: readonly Sample[], at: number): Sample {
  return samples[
    Math.max(
      0,
      Math.min(samples.length - 1, Math.round((at - samples[0]![0]) / (samples[1]![0] - samples[0]![0]))),
    )
  ]!;
}

function visibility(city: SkyCity, sample: Sample) {
  const point = ephemerisPoint(sample);
  const altitude = horizontal(city, point, 1 + point.lift!).altitude;
  return [
    {
      label: `${city.name} · altitude`,
      value: `${altitude.toFixed(1)}° · ${altitude > 0 ? "above horizon" : "below horizon"}`,
    },
    {
      label: "Local sky",
      value: sunElevation(city.lon, city.lat, sample[0]) > -0.833 ? "Daylight" : "Sun below horizon",
    },
  ];
}

export async function apophisStory(city: SkyCity): Promise<EarthStoryData> {
  const { samples } = await atlasArchive<{ samples: Sample[] }>("apophis");
  const geostationary = Array.from({ length: 181 }, (_, i) => ({
    lon: -180 + i * 2,
    lat: 0,
    lift: 42164 / EARTH_RADIUS_KM - 1,
  }));
  const closest = samples.reduce((a, b) => (a[3] < b[3] ? a : b));
  const frames = samples.map((sample, i): StoryFrame => {
    const point = ephemerisPoint(sample);
    const vector = toVec3(point.lon, point.lat, 1 + point.lift!);
    return {
      at: sample[0],
      caption: "Predicted 2029 flyby · Earth distances shown at physical scale",
      marks: [{ ...point, size: 17, color: 0xe9d9b7 }],
      paths: [
        { points: geostationary, color: 0x587c9b },
        { points: samples.slice(0, i + 1).map(ephemerisPoint), color: 0xe2c8a1 },
      ],
      orbit: {
        focus: vector.map((v) => v * 0.32) as [number, number, number],
        distance: Math.max(20, (1 + point.lift!) * 2.6),
      },
      measurements: [
        {
          label: "Height above mean Earth radius",
          value: `${Math.round(sample[3] * AU - EARTH_RADIUS_KM).toLocaleString()} km`,
        },
        { label: "Geostationary reference height", value: "35,793 km" },
        ...visibility(city, sample),
      ],
    };
  });
  return {
    frames,
    target: { lon: -30, lat: 35, zoom: 1 },
    sky: (at) => citySky(city, sampleAt(samples, at), "Apophis"),
    timelineLabel: "Predicted flyby · UTC",
    chapters: [
      { at: samples[0]![0], label: "Approach" },
      { at: closest[0], label: "Closest approach" },
      { at: samples.at(-1)![0], label: "Departure" },
    ],
    legend: [
      { color: "#587c9b", label: "Geostationary altitude reference" },
      { color: "#e2c8a1", label: "Apophis · rotating-Earth reference frame" },
    ],
  };
}

export function lunarShadow(moon: Sample, sun: Sample) {
  const m = ephemerisPoint(moon),
    s = ephemerisPoint(sun);
  const center = toVec3(m.lon, m.lat, 1 + m.lift!);
  const direction = toVec3(s.lon, s.lat, 1);
  const along = -center.reduce((sum, v, i) => sum + v * direction[i]!, 0);
  const distance = Math.hypot(...center.map((v, i) => v + direction[i]! * along));
  const umbra = 1.02 - (along * (695700 / EARTH_RADIUS_KM - 1.02)) / ((sun[3] * AU) / EARTH_RADIUS_KM);
  const penumbra = 1.02 + (along * (695700 / EARTH_RADIUS_KM + 1.02)) / ((sun[3] * AU) / EARTH_RADIUS_KM);
  const radius = 1737.4 / EARTH_RADIUS_KM;
  return {
    distance,
    umbra,
    penumbra,
    phase:
      along <= 0 || distance >= penumbra + radius
        ? "Outside the shadow"
        : distance < umbra - radius
          ? "Totality"
          : distance < umbra + radius
            ? "Partial umbral eclipse"
            : "Penumbral eclipse",
  };
}

export async function eclipseStory(city: SkyCity): Promise<EarthStoryData> {
  const data = await atlasArchive<{ moon: Sample[]; sun: Sample[] }>("eclipse");
  const frames = data.moon.map((sample, i): StoryFrame => {
    const moon = ephemerisPoint(sample),
      sun = ephemerisPoint(data.sun[i]!);
    const shadow = lunarShadow(sample, data.sun[i]!);
    const center = toVec3(moon.lon, moon.lat, 1 + moon.lift!);
    const p = Math.min(1, i / 65),
      focus = p * p * (3 - 2 * p);
    return {
      at: sample[0],
      caption: `${shadow.phase} · computed shadow geometry`,
      paths: [{ points: lunarHorizon(moon), color: 0x8ba4ba }],
      marks: [
        { lon: city.lon, lat: city.lat, size: 9, color: 0xe5d4b1 },
        { lon: moon.lon, lat: moon.lat, size: 11, color: 0xb9d7e9 },
      ],
      orbit: {
        focus: center.map((v) => v * (0.5 + 0.5 * focus)) as [number, number, number],
        distance: 110 * (1 - focus) + 2.6 * focus,
        eclipse: {
          moon,
          radius: 1737.4 / EARTH_RADIUS_KM,
          sun,
          sunDistance: (data.sun[i]![3] * AU) / EARTH_RADIUS_KM,
        },
      },
      measurements: [{ label: "Eclipse phase", value: shadow.phase }, ...visibility(city, sample)],
    };
  });
  return {
    frames,
    lunarImage: moonTexture,
    mapTarget: { lon: ephemerisPoint(data.moon[210]!).lon, lat: 15, zoom: 1 },
    legend: [
      { color: "#8ba4ba", label: "Moon on the horizon · visible on the blue dot’s side" },
      { color: "#e5d4b1", label: "Your city · altitude and daylight shown below" },
    ],
    target: { lon: wrap(ephemerisPoint(data.moon[210]!).lon + 155), lat: -15, zoom: 1 },
    sky: (at) => citySky(city, sampleAt(data.moon, at), "Moon"),
    chapters: [
      { at: Date.parse("2025-03-14T03:57:24Z"), label: "Penumbral entry" },
      { at: Date.parse("2025-03-14T05:09:33Z"), label: "Umbral entry" },
      { at: Date.parse("2025-03-14T06:58:42Z"), label: "Greatest eclipse" },
      { at: Date.parse("2025-03-14T08:47:48Z"), label: "Umbral exit" },
    ],
  };
}
