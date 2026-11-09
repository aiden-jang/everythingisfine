import faultData from "../../sources/earth-stories/fault.json?raw";
import fireData from "../../sources/earth-stories/fire.json?raw";
import iceData from "../../sources/earth-stories/ice.json?raw";
import { expect, test, vi } from "vitest";
import { faultStory, fireStory, northStory } from "./groundStories";
import { satelliteStory } from "./satelliteStories";
import { cometPosition, cometSky } from "./cometStory";
import { skyCities } from "../tonight/cities";
import { curtainGeometry } from "../../globe/observationCurtain";
import transect from "../../sources/earth-stories/dust-transect.json";
import { point } from "./types";

vi.mock("./archive", () => ({
  archive: (id: "fault" | "fire" | "ice") =>
    Promise.resolve(JSON.parse({ fault: faultData, fire: fireData, ice: iceData }[id])),
}));

test("Ridgecrest keeps both mapped events distinct from the later combined radar observation", async () => {
  const data = await faultStory();
  expect(data.frames.map((f) => new Date(f.at).toISOString().slice(0, 10))).toEqual([
    "2019-07-04",
    "2019-07-06",
    "2019-07-08",
  ]);
  expect(data.frames[0]!.paths!.length).toBeLessThan(data.frames[1]!.paths!.length);
  expect(data.frames[2]!.raster?.bounds).toEqual([-117.898717, 34.99605, -117.098717, 36.18605]);
  expect(data.sites!.filter((s) => s.at === data.frames[0]!.at)).toHaveLength(6);
  expect(data.sites!.filter((s) => s.at === data.frames[1]!.at)).toHaveLength(6);
  expect(data.sites!.every((s) => s.lon > -118.2 && s.lon < -117 && s.lat > 35 && s.lat < 36.5)).toBe(true);
});

test("fire playback shows only detections available by the selected acquisition", async () => {
  const data = await fireStory();
  expect(data.frames.length).toBeGreaterThan(150);
  expect(data.frames.every((f, i) => !i || f.at > data.frames[i - 1]!.at)).toBe(true);
  const first = data.geometry!(data.frames[0]!);
  const last = data.geometry!(data.frames.at(-1)!);
  expect(first.marks!.length).toBeLessThan(last.marks!.length);
  expect(first.marks!.filter((p) => p.color === 0xffcc7b)).toHaveLength(53);
  expect(last.marks!.every((p) => p.lon >= -121.7 && p.lon <= -120.2 && p.lat >= 39.7 && p.lat <= 40.9)).toBe(
    true,
  );
});

test("daily sea ice reaches the v4 2012 minimum with a matching-date reference outline", async () => {
  const data = await satelliteStory("ice", "");
  expect(data.frames).toHaveLength(181);
  const last = data.frames.at(-1)!;
  expect(new Date(last.at).toISOString()).toBe("2012-09-16T12:00:00.000Z");
  expect(last.measurements?.[0]?.value).toBe("3.34 million km²");
  expect(last.paths!.length).toBeGreaterThan(0);
  expect(
    last.paths!.flatMap((p) => p.points).every((p) => p.lat > 40 && p.lat <= 90 && Math.abs(p.lon) <= 180),
  ).toBe(true);
  expect(data.series![1]!.samples.at(-1)![1]).toBeGreaterThan(6);
});

test("ozone comparison preserves the seasonal sampling and its published area estimates", async () => {
  const [large, small] = await Promise.all([
    satelliteStory("ozone", "2006"),
    satelliteStory("ozone", "2019"),
  ]);
  expect(large.frames.map((f) => new Date(f.at).toISOString().slice(5))).toEqual(
    small.frames.map((f) => new Date(f.at).toISOString().slice(5)),
  );
  expect(Math.max(...large.series![0]!.samples.map((s) => s[1]))).toBe(29.62);
  expect(Math.max(...small.series![0]!.samples.map((s) => s[1]))).toBeLessThan(17);
});

test("water months keep archive gaps and match the measured regional time series", async () => {
  const data = await satelliteStory("water", "California");
  expect(data.frames.length).toBeGreaterThan(40);
  expect(data.frames.length).toBeLessThan(78);
  expect(data.frames.every((f, i) => !i || f.at > data.frames[i - 1]!.at)).toBe(true);
  expect(new Date(data.frames[0]!.at).toISOString()).toBe("2011-03-16T12:00:00.000Z");
  expect(data.frames[0]!.measurements?.[0]?.value).toBe("+12.1 cm");
  expect(data.series![0]!.samples.some((s) => s[1] < -10)).toBe(true);
});

test("magnetic north uses annual NOAA dip poles and city-specific model values", async () => {
  const data = await northStory("New York");
  expect(data.frames).toHaveLength(126);
  expect(data.frames.at(-1)!.marks![0]).toMatchObject({ lon: 138.057, lat: 85.778 });
  expect(data.frames[0]!.measurements![1]!.value).toBe("8.70° west");
});

test("NEOWISE stays distant from Earth and its direction is projected into the selected city’s sky", () => {
  const at = Date.parse("2020-07-23T01:00:00Z");
  const position = cometPosition(at);
  expect(position.au).toBeGreaterThan(0.69);
  expect(position.au).toBeLessThan(0.7);
  expect(position.elongation).toBeCloseTo(37.5914, 4);
  const a = cometSky(skyCities[0]!, at),
    b = cometSky(
      skyCities.find((c) => c.name === "Seoul")!,
      at,
    );
  expect(a.bodies.at(-1)?.name).toBe("NEOWISE");
  expect(a.bodies.at(-1)?.altitude).not.toBe(b.bodies.at(-1)?.altitude);
});

test("the lidar curtain keeps its measured ground coordinates and declared height exaggeration", () => {
  const geometry = curtainGeometry(transect.points.map(point), transect.height, transect.exaggeration);
  const coordinates = geometry.getAttribute("aLonLat"),
    vertices = geometry.getAttribute("position");
  expect([coordinates.getX(0), coordinates.getY(0)]).toEqual([
    expect.closeTo(-66.32, 3),
    expect.closeTo(29.73, 3),
  ]);
  const radius = Math.hypot(vertices.getX(1), vertices.getY(1), vertices.getZ(1));
  expect(radius - 1.013).toBeCloseTo((15 * 80) / 6371, 5);
  expect(geometry.index!.count).toBe(18);
  geometry.dispose();
});
