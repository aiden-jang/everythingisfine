import { describe, expect, it } from "vitest";
import { depthBands, DEPTH_DEEP_KM, DEPTH_SHALLOW_KM } from "./depth";
import { createStore, type Store } from "./store";
import type { Filters, Reading } from "./types";

const NOW = Date.parse("2026-08-21T00:00:00Z");
const FILTERS: Filters = {
  minMagnitude: 2, windowMs: 86_400_000, sources: new Set(["usgs", "emsc"]),
} as Filters;

/** Spread apart in longitude, so nothing here is reconciled into one event by proximity. */
function storeWith(depths: (number | null)[]): Store {
  const store = createStore(100);
  depths.forEach((depthKm, i) => {
    const reading: Reading = {
      source: "usgs", id: `e${i}`, magnitude: 4, scale: "Mww",
      lon: 140 + i * 3, lat: 38, depthKm: depthKm === null ? Number.NaN : depthKm,
      time: NOW - 60_000, place: "somewhere", kind: "earthquake", receivedAt: NOW,
    };
    store.ingest(reading);
  });
  return store;
}

describe("the bands the markers draw", () => {
  it("uses the thresholds the shader uses", () => {
    expect([DEPTH_SHALLOW_KM, DEPTH_DEEP_KM]).toEqual([70, 300]);
  });

  it("counts each band, and totals what passed the filter", () => {
    const bands = depthBands(storeWith([5, 40, 120, 250, 400, 600]), FILTERS, NOW);
    expect(bands).toMatchObject({ shallow: 2, intermediate: 2, deep: 2, unknown: 0, total: 6 });
  });

  it("puts the boundaries in the band the shader puts them in", () => {
    // 70 is intermediate and 300 is deep: the comparisons are the same `<` the hole uses.
    const bands = depthBands(storeWith([69.9, 70, 299.9, 300]), FILTERS, NOW);
    expect(bands).toMatchObject({ shallow: 1, intermediate: 2, deep: 1 });
  });

  it("keeps a missing depth apart from a zero one", () => {
    /*
     * Zero is a real seabed value. Folding "not given" into shallow would turn an agency's silence into
     * a measurement, which is the same refusal `depth()` makes when it prints "not given".
     */
    const bands = depthBands(storeWith([0, null, null]), FILTERS, NOW);
    expect(bands).toMatchObject({ shallow: 1, unknown: 2, total: 3 });
  });

  it("counts nothing for an empty window", () => {
    expect(depthBands(createStore(), FILTERS, NOW))
      .toEqual({ shallow: 0, intermediate: 0, deep: 0, unknown: 0, total: 0 });
  });

  it("respects the magnitude filter, so the counts match what is drawn", () => {
    const store = storeWith([10, 400]);
    const strict = { ...FILTERS, minMagnitude: 5 } as Filters;
    expect(depthBands(store, strict, NOW).total).toBe(0);
  });
});
