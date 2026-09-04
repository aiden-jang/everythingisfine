import { describe, expect, it } from "vitest";
import { createStore } from "../data/store";
import { DEFAULT_FILTERS } from "./feed";
import { fitLine, sizesOf } from "./gutenberg";
import type { Reading } from "../data/types";

const NOW = 1_700_000_000_000;

function storeOf(magnitudes: readonly number[]): ReturnType<typeof createStore> {
  const store = createStore(200_000);
  magnitudes.forEach((magnitude, i) => {
    const r: Reading = {
      source: "usgs",
      id: `q${i}`,
      magnitude,
      scale: "mb",
      lon: ((i * 37) % 360) - 180,
      lat: ((i * 17) % 160) - 80,
      depthKm: 10,
      time: NOW - (i % 3600) * 1000,
      place: "somewhere",
      kind: "earthquake",
      receivedAt: NOW,
    };
    store.ingest(r);
  });
  return store;
}

/**
 * A synthetic catalogue that obeys the law exactly, with a detection floor. Inverse-transform sampling,
 * quantised to the tenth the feeds report at. Deterministic, so a failure is a failure and not a bad draw.
 */
function powerLaw(count: number, b: number, mc: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    const u = (i - 0.5) / count;
    const m = mc - Math.log10(1 - u) / b;
    out.push(Math.round(m * 10) / 10);
  }
  return out;
}

describe("how the sizes stack up", () => {
  it("recovers the slope it was built with", () => {
    // The test the whole file exists for. A catalogue drawn from b = 1.0 has to come back as 1.0, or the
    // estimator is measuring something else.
    for (const b of [0.8, 1.0, 1.25]) {
      const sizes = sizesOf(storeOf(powerLaw(20_000, b, 2.5)), { ...DEFAULT_FILTERS, minMagnitude: 0 }, NOW);
      expect(sizes.b, `b=${b}`).toBeCloseTo(b, 1);
    }
  });

  it("finds where the catalogue stops hearing everything, to within a bin", () => {
    /*
     * Within one bin, which is what maximum curvature can promise. This sample has a hard floor exactly at a
     * bin centre, so the bin at the floor catches half its width and the fullest bin comes out one step high.
     * Real catalogues roll off over several tenths rather than stopping dead.
     */
    for (const floor of [2.5, 3.2, 4.0]) {
      const sizes = sizesOf(
        storeOf(powerLaw(20_000, 1, floor)),
        { ...DEFAULT_FILTERS, minMagnitude: 0 },
        NOW,
      );
      expect(Math.abs(sizes.complete - floor), `floor ${floor}`).toBeLessThanOrEqual(0.1001);
    }
  });

  it("counts cumulatively, so the curve can only fall", () => {
    const sizes = sizesOf(storeOf(powerLaw(5_000, 1, 2)), { ...DEFAULT_FILTERS, minMagnitude: 0 }, NOW);
    expect(sizes.points.length).toBeGreaterThan(10);
    for (let i = 1; i < sizes.points.length; i += 1) {
      expect(sizes.points[i]!.atOrAbove).toBeLessThanOrEqual(sizes.points[i - 1]!.atOrAbove);
    }
    // And the first point counts everything, because everything is at or above the smallest.
    expect(sizes.points[0]!.atOrAbove).toBe(5_000);
  });

  it("refuses to quote a slope from a handful of events", () => {
    // Twenty is already generous for a maximum-likelihood b. Null rather than a wide number, because there
    // is no honest error bar to print beside it.
    expect(
      sizesOf(storeOf([4.1, 4.4, 5.0, 5.2, 6.1]), { ...DEFAULT_FILTERS, minMagnitude: 0 }, NOW).b,
    ).toBeNull();
    expect(sizesOf(storeOf([]), DEFAULT_FILTERS, NOW).b).toBeNull();
  });

  it("says nothing at all about an empty window", () => {
    const sizes = sizesOf(storeOf([]), DEFAULT_FILTERS, NOW);
    expect(sizes.points).toEqual([]);
    expect(sizes.used).toBe(0);
    expect(fitLine(sizes)).toBeNull();
  });

  it("describes what is on screen, not what is in the buffer", () => {
    // The same rule the headline count had to learn: a chart ignoring the magnitude filter would sit beside
    // a globe showing a tenth of it and describe neither.
    const store = storeOf(powerLaw(4_000, 1, 2));
    const all = sizesOf(store, { ...DEFAULT_FILTERS, minMagnitude: 0 }, NOW);
    const filtered = sizesOf(store, { ...DEFAULT_FILTERS, minMagnitude: 4 }, NOW);
    expect(filtered.points[0]!.atOrAbove).toBeLessThan(all.points[0]!.atOrAbove);
    expect(filtered.points[0]!.magnitude).toBeGreaterThanOrEqual(4);
  });

  it("draws its line through the data it was estimated from", () => {
    // Anchored on the count at completeness, so the line cannot float beside the points.
    const sizes = sizesOf(storeOf(powerLaw(20_000, 1, 2.5)), { ...DEFAULT_FILTERS, minMagnitude: 0 }, NOW);
    const line = fitLine(sizes)!;
    expect(line.from[0]).toBeCloseTo(sizes.complete, 5);
    const anchor = sizes.points.find((p) => Math.abs(p.magnitude - sizes.complete) < 0.05)!;
    expect(line.from[1]).toBeCloseTo(Math.log10(anchor.atOrAbove), 5);
    // And it slopes down, at the rate quoted.
    expect(line.to[1]).toBeLessThan(line.from[1]);
    const slope = (line.from[1] - line.to[1]) / (line.to[0] - line.from[0]);
    expect(slope).toBeCloseTo(sizes.b!, 5);
  });
});
