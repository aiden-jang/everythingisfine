import { describe, expect, it } from "vitest";
import { profileGeometry, profileTakeaway } from "./profileGeometry";

const samples = [
  { depth: 1000, pressure: 1008, temperature: -1, salinity: 34.001 },
  { depth: 500, pressure: 504, temperature: 0, salinity: 34.002 },
  { depth: 5, pressure: 5, temperature: 4, salinity: 34.003 },
];

describe("measured Argo profile", () => {
  it("plots actual values on a shared scale with depth increasing downward", () => {
    const plot = profileGeometry(samples, "temperature");
    expect(plot.min).toBe(-1);
    expect(plot.max).toBe(4);
    expect(plot.points[0]!.y).toBe(166);
    expect(plot.points[2]!.y).toBeLessThan(plot.points[1]!.y);
    expect(plot.points[1]!.x - plot.points[0]!.x).toBeCloseTo((plot.points[2]!.x - plot.points[1]!.x) / 4);
  });

  it("keeps a constant profile finite and a narrow salinity range distinguishable", () => {
    const constant = profileGeometry(
      samples.map((sample) => ({ ...sample, temperature: 3 })),
      "temperature",
    );
    expect(constant.points.every((point) => point.x === 166)).toBe(true);
    expect(constant.line).not.toMatch(/NaN|Infinity/);
    const salt = profileGeometry(samples, "salinity");
    expect(salt.points[2]!.x - salt.points[0]!.x).toBeGreaterThan(100);
    expect(salt.low).toBeLessThan(34.001);
    expect(salt.high).toBeGreaterThan(34.003);
  });

  it("describes the measured endpoints without assuming the shallow water is warmer", () => {
    expect(profileTakeaway(samples).heading).toContain("warmer than");
    expect(profileTakeaway(samples).reading).toContain("4.00 °C at 5 m");
    const cold = samples.map((sample) => ({ ...sample, temperature: -sample.temperature }));
    expect(profileTakeaway(cold).heading).toContain("colder than");
    const flat = samples.map((sample) => ({ ...sample, temperature: 2 }));
    expect(profileTakeaway(flat).heading).toContain("about as warm as");
  });
});
