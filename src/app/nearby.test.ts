import { describe, expect, it } from "vitest";
import { depthClass, findNearby, NEARBY_KM } from "./nearby";
import { createStore } from "../data/store";
import type { Filters, Reading } from "../data/types";

const NOW = 1_700_000_000_000;
const base = {
  source: "usgs" as const, scale: "mb", depthKm: 10, place: "x", kind: "earthquake",
  receivedAt: NOW,
};
const reading = (id: string, lon: number, lat: number, magnitude: number, dt = 0): Reading => ({
  ...base, id, lon, lat, magnitude, time: NOW - dt,
});
const filters: Filters = {
  minMagnitude: 0, windowMs: 24 * 3_600_000, sources: new Set(["usgs", "emsc"]),
};

describe("nearby activity", () => {
  it("counts neighbours inside the radius and ignores the rest", () => {
    const store = createStore(50);
    const target = store.ingest(reading("a", 120, -8, 5)).quake;
    store.ingest(reading("b", 120.5, -8.2, 3, 1_000));      // ~60km
    store.ingest(reading("c", 121, -8.4, 4, 2_000));        // ~120km
    store.ingest(reading("d", 130, -8, 6, 3_000));          // far away

    const near = findNearby(store, target, filters, NOW);
    expect(near.count).toBe(2);
    expect(near.largest).toBe(4);
  });

  it("never counts the event itself", () => {
    const store = createStore(50);
    const target = store.ingest(reading("a", 120, -8, 5)).quake;
    expect(findNearby(store, target, filters, NOW).count).toBe(0);
    expect(findNearby(store, target, filters, NOW).largest).toBeNull();
  });

  it("ranks by magnitude, not by distance", () => {
    const store = createStore(50);
    const target = store.ingest(reading("a", 120, -8, 3)).quake;
    store.ingest(reading("close", 120.05, -8, 2.1, 1_000));
    store.ingest(reading("big", 120.9, -8, 5.9, 2_000));

    // A person scanning neighbours is looking for the big one, not the nearest one.
    expect(findNearby(store, target, filters, NOW).notable[0]!.quake.primary.id).toBe("big");
  });

  it("respects the filters the globe is using", () => {
    const store = createStore(50);
    const target = store.ingest(reading("a", 120, -8, 5)).quake;
    store.ingest(reading("small", 120.2, -8, 1.2, 1_000));

    expect(findNearby(store, target, filters, NOW).count).toBe(1);
    // Something the globe is not drawing must not be counted in a panel beside it.
    expect(findNearby(store, target, { ...filters, minMagnitude: 3 }, NOW).count).toBe(0);
  });

  it("uses a radius wide enough for a sequence and narrower than a margin", () => {
    expect(NEARBY_KM).toBeGreaterThan(50);
    expect(NEARBY_KM).toBeLessThan(400);
  });
});

describe("depth class", () => {
  it("uses the conventional boundaries", () => {
    expect(depthClass(10)).toBe("shallow");
    expect(depthClass(69.9)).toBe("shallow");
    expect(depthClass(70)).toBe("intermediate");
    expect(depthClass(299)).toBe("intermediate");
    expect(depthClass(300)).toBe("deep");
  });

  it("says nothing when the depth is missing", () => {
    // A missing depth is NaN rather than zero, and calling that "shallow" would invent a fact.
    expect(depthClass(Number.NaN)).toBeNull();
  });
});
