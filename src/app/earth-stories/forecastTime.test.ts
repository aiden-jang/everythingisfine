import { NetCDFReader, type Attribute } from "netcdfjs";
import { expect, test, vi } from "vitest";
import { forecastTime } from "./forecastTime";
import { parseRiver } from "./riverData";
import recorded from "../../sources/earth-atlas/river.nc?url&inline";

const buffer = () => Uint8Array.from(atob(recorded.split(",")[1]!), (c) => c.charCodeAt(0)).buffer;

test("forecast axes follow CF metadata when NCSS renames them between runs", () => {
  const grid = new NetCDFReader(buffer());
  const original = forecastTime(grid, grid.variables.find((v) => v.name === "time")!.dimensions[0]);
  const read = grid.getDataVariable.bind(grid);
  const renamed = grid.variables.map((v) => ({
    ...v,
    name: v.name === "time" ? "time1" : v.name === "reftime" ? "reftime1" : v.name,
  }));
  const source = {
    variables: renamed,
    getDataVariable: (variable: Parameters<typeof read>[0]) => {
      const name = typeof variable === "string" ? variable : variable.name;
      return read(name === "time1" ? "time" : name === "reftime1" ? "reftime" : name);
    },
  };
  expect(forecastTime(source, renamed.find((v) => v.name === "time1")!.dimensions[0])).toEqual(original);
  expect(original.times).toHaveLength(5);
  expect(original.times[1]! - original.times[0]!).toBe(6 * 3600000);
});

test("forecast and reference coordinates use their own epochs and reject missing or ambiguous axes", () => {
  const grid = new NetCDFReader(buffer());
  const variable = grid.variables.find((v) => v.name === "reftime")!;
  const dimension = variable.dimensions[0];
  const expected = forecastTime(grid, dimension);
  (variable.attributes as Attribute[]).find((a) => a.name === "units")!.value =
    "Hour since 2026-11-03T00:00:00Z";
  expect(forecastTime(grid, dimension).runs).toEqual(expected.runs.map((at) => at + 86400000));
  expect(forecastTime(grid, dimension).times).toEqual(expected.times);
  expect(() => forecastTime(grid, undefined)).toThrow("coordinate");
  grid.variables.push({ ...variable, name: "extra_reference" });
  expect(() => forecastTime(grid, dimension)).toThrow("ambiguous");
});

test("transport columns and timestamps survive renamed time coordinates", () => {
  const result = parseRiver(buffer(), true);
  expect(result.frames).toHaveLength(5);
  expect(result.frames.every((f) => f.paths!.length > 0)).toBe(true);
  const original = Object.getOwnPropertyDescriptor(NetCDFReader.prototype, "variables")!.get!;
  const axes = vi.spyOn(NetCDFReader.prototype, "variables", "get").mockImplementation(function (
    this: NetCDFReader,
  ) {
    return original.call(this).map((v: NetCDFReader["variables"][number]) => ({
      ...v,
      name: v.name === "time" ? "time1" : v.name === "reftime" ? "reftime1" : v.name,
    }));
  });
  try {
    expect(parseRiver(buffer(), true)).toEqual(result);
  } finally {
    axes.mockRestore();
  }
});
