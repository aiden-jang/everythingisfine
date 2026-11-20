import { describe, expect, it } from "vitest";
import { argoStation, compileArgoProfile } from "../../sources/argo";
import { profileGeometry, profileTakeaway } from "./profileGeometry";
import recorded from "./recorded.json";
import { firstFloatProfile } from "./firstProfile";

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
    expect(profileTakeaway(samples).reading).toContain("4.00\u00a0°C at 5\u00a0m");
    const cold = samples.map((sample) => ({ ...sample, temperature: -sample.temperature }));
    expect(profileTakeaway(cold).heading).toContain("colder than");
    const flat = samples.map((sample) => ({ ...sample, temperature: 2 }));
    expect(profileTakeaway(flat).heading).toContain("about as warm as");
  });

  it("finds a warmer interior sample without replacing the endpoint comparison", () => {
    const profile = [
      { ...samples[0]!, temperature: 3.283 },
      { ...samples[1]!, depth: 62, temperature: 6.896 },
      { ...samples[2]!, temperature: 5.6 },
    ];
    const takeaway = profileTakeaway(profile);
    expect(takeaway.heading).toContain("warmer than");
    expect(takeaway.reading).toContain("5.60\u00a0°C at 5\u00a0m");
    expect(takeaway.finding.index).toBe(1);
    expect(takeaway.finding.heading).toBe("The warmest water was below the surface.");
    expect(takeaway.finding.reading).toContain("6.90\u00a0°C at 62\u00a0m");
    expect(takeaway.finding.reading).toContain("shallowest sample was 5.60\u00a0°C");
  });

  it("identifies tied interior maxima and selects an actual representative sample", () => {
    const profile = [
      { ...samples[0]!, temperature: 3 },
      { ...samples[1]!, depth: 200, temperature: 7 },
      { ...samples[1]!, depth: 60, temperature: 7 },
      { ...samples[2]!, temperature: 4 },
    ];
    const { finding } = profileTakeaway(profile);
    expect(finding.index).toBe(2);
    expect(finding.heading).toBe("The warmest samples were below the surface.");
    expect(finding.reading).toContain("7.00\u00a0°C at 60\u00a0m, one of 2 samples at the same maximum");
  });

  it("keeps flat, surface-warmest, and deep-warmest findings grounded in their endpoints", () => {
    const profiles = [
      { values: [2, 2, 2], index: 2 },
      { values: [1, 2, 4], index: 2 },
      { values: [4, 2, 1], index: 0 },
      { values: [4, 4, 1], index: 0 },
      { values: [4, 1, 4], index: 2 },
    ];
    for (const { values, index } of profiles) {
      const profile = samples.map((sample, at) => ({ ...sample, temperature: values[at]! }));
      const takeaway = profileTakeaway(profile);
      expect(takeaway.finding).toEqual({ heading: takeaway.heading, reading: takeaway.reading, index });
      expect(takeaway.finding.reading).not.toContain("62\u00a0m");
      expect(takeaway.finding.heading).not.toContain("below the surface");
    }
  });

  it("keeps constant salinity finite and describes the direction of measured salinity", () => {
    const constant = profileGeometry(
      samples.map((sample) => ({ ...sample, salinity: 35.1 })),
      "salinity",
    );
    expect(constant.points.every(({ x }) => Math.abs(x - 166) < 0.00001)).toBe(true);
    expect(constant.line).not.toMatch(/NaN|Infinity/);
    expect(constant.low).toBeLessThan(35.1);
    expect(constant.high).toBeGreaterThan(35.1);
    expect(constant.trend).toContain("stays near 35.100");
    expect(profileGeometry(samples, "salinity").trend).toContain("saltier than");
  });

  it("uses the recorded profile's real ranges and the measured warm maximum near 62 metres", () => {
    const saved = recorded[0]!;
    const station = argoStation(saved.station)!;
    const profile = compileArgoProfile(station, saved.measurements)!;
    expect(profile).toMatchObject(firstFloatProfile);
    const temperature = profileGeometry(profile.samples, "temperature");
    const salinity = profileGeometry(profile.samples, "salinity");
    expect(temperature.min).toBe(3.283);
    expect(temperature.max).toBe(6.896);
    expect(temperature.high - temperature.low).toBeCloseTo((6.896 - 3.283) * 1.16);
    expect(salinity.min).toBe(34.395);
    expect(salinity.max).toBe(35.116);
    expect(salinity.high - salinity.low).toBeCloseTo((35.116 - 34.395) * 1.16);
    for (const plot of [temperature, salinity]) {
      expect(plot.points).toHaveLength(profile.samples.length);
      expect(plot.points.every(({ x, y }) => x > 54 && x < 278 && y >= 24 && y <= 166)).toBe(true);
    }
    const { finding } = profileTakeaway(profile.samples);
    expect(profile.samples[finding.index]!.temperature).toBe(6.896);
    expect(Math.round(profile.samples[finding.index]!.depth)).toBe(62);
    expect(finding.reading).toContain("6.90\u00a0°C at 62\u00a0m");
  });
});
