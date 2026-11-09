import { expect, test } from "vitest";
import apophis from "../../sources/earth-atlas/apophis.json?raw";
import eclipse from "../../sources/earth-atlas/eclipse.json?raw";
import seafloor from "../../sources/earth-atlas/seafloor.json?raw";
import { columnTransport } from "./riverData";
import { heatColor, parseReefTemperatures } from "./reefData";
import { ephemerisPoint, lunarHorizon, lunarShadow } from "./atlasOrbits";
import { readTerrainSection, sectionSamples, terrainSample, terrainSource } from "./terrainSection";
import { horizontal } from "../../geo/tonight";
import { seafloorGeometry } from "../../globe/observationTerrain";
import type { ObservationTerrain } from "../observations/types";
import { EARTH_RADIUS_KM } from "../../geo/sphere";

const archive = (name: "apophis" | "eclipse" | "seafloor") =>
  JSON.parse({ apophis, eclipse, seafloor }[name]);

test("transport integrates only the complete above-ground pressure column", () => {
  const p = [20000, 30000, 50000, 70000, 100000];
  const q = p.map(() => 0.01),
    u = p.map(() => 10),
    v = p.map(() => 0);
  expect(columnTransport(p, 100000, u, v, q)?.magnitude).toBeCloseTo((0.1 * 70000) / 9.80665, 5);
  expect(columnTransport(p, 85000, u, v, q)?.magnitude).toBeCloseTo((0.1 * 55000) / 9.80665, 5);
  expect(columnTransport(p.slice(2), 100000, u, v, q)).toBeNull();
  expect(columnTransport(p, 100000, u, v, [0, 0.01, NaN, 0.01, 0.01])).toBeNull();
  expect(
    columnTransport(
      p,
      100000,
      u,
      v,
      q.map(() => -0.01),
    ),
  ).toBeNull();
});

test("heat gaps stay transparent and unavailable temperatures never become zero", () => {
  for (const value of [NaN, -999, Infinity]) expect(heatColor(value)[3]).toBe(0);
  expect(heatColor(0)[3]).toBe(230);
  expect(heatColor(8)).toEqual([223, 122, 77, 230]);
  const data = parseReefTemperatures(
    "time,latitude,longitude,analysed_sst\nUTC,degrees_north,degrees_east,degree_C\n2023-08-10T12:00:00Z,24.425,-81.375,31.45\n2023-08-11T12:00:00Z,24.425,-81.375,NaN\n2023-08-12T12:00:00Z,24.425,-81.375,",
  );
  expect([...data.values()]).toEqual([31.45]);
});

test("Apophis retains JPL distance and the lunar horizon includes observer parallax", () => {
  const samples: [number, number, number, number, number][] = archive("apophis").samples;
  const closest = samples.reduce((a, b) => (a[3] < b[3] ? a : b));
  const point = ephemerisPoint(closest);
  expect(point.lift! * EARTH_RADIUS_KM).toBeGreaterThan(31000);
  expect(point.lift! * EARTH_RADIUS_KM).toBeLessThan(33000);
  for (const p of lunarHorizon(point))
    expect(horizontal(p, point, 1 + point.lift!).altitude).toBeCloseTo(0, 6);
});

test("physical shadow geometry agrees with the published total-eclipse sequence", () => {
  const data = archive("eclipse");
  expect(lunarShadow(data.moon[0], data.sun[0]).phase).toBe("Outside the shadow");
  const i = data.moon.findIndex((s: number[]) => s[0] === Date.parse("2025-03-14T06:59:00Z"));
  expect(lunarShadow(data.moon[i], data.sun[i]).phase).toBe("Totality");
  expect(lunarShadow(data.moon.at(-1), data.sun.at(-1)).phase).toBe("Outside the shadow");
});

test("depth sections validate locations and retain physical depths despite exaggerated rendering", () => {
  const grid: ObservationTerrain = archive("seafloor");
  expect(terrainSample(grid, 142.2, 11.35)!.elevation).toBe(-10923);
  expect(terrainSource(11)).toBe("Multibeam sonar");
  expect(readTerrainSection("section:0,0,1,1", grid)).toBeNull();
  expect(readTerrainSection("section:142,11,142,11", grid)).toBeNull();
  const line = readTerrainSection("section:141.6,10.7,142.9,12", grid)!;
  const samples = sectionSamples(grid, line);
  expect(samples).toHaveLength(101);
  expect(samples.at(-1)!.km).toBeGreaterThan(190);
  expect(samples.every((s) => s.meters !== null && s.meters < 0)).toBe(true);
  const mesh = seafloorGeometry(grid);
  expect(mesh.getAttribute("position").count).toBe(grid.rows * grid.columns);
  expect(mesh.index!.count).toBe((grid.rows - 1) * (grid.columns - 1) * 6);
  mesh.dispose();
});
