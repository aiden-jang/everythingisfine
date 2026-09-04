import { describe, expect, it } from "vitest";
import { NEARBY_KM, depthClass, findNearby, stepsFrom } from "./nearby";
import { createStore } from "../data/store";
import type { Filters, Reading } from "../data/types";

const NOW = 1_700_000_000_000;
const base = {
  source: "usgs" as const,
  scale: "mb",
  depthKm: 10,
  place: "x",
  kind: "earthquake",
  receivedAt: NOW,
};
const reading = (id: string, lon: number, lat: number, magnitude: number, dt = 0): Reading => ({
  ...base,
  id,
  lon,
  lat,
  magnitude,
  time: NOW - dt,
});
const filters: Filters = {
  minMagnitude: 0,
  windowMs: 24 * 3_600_000,
  sources: new Set(["usgs", "emsc"]),
};

describe("nearby activity", () => {
  it("counts neighbours inside the radius and ignores the rest", () => {
    const store = createStore(50);
    const target = store.ingest(reading("a", 120, -8, 5)).quake;
    store.ingest(reading("b", 120.5, -8.2, 3, 1_000)); // ~60km
    store.ingest(reading("c", 121, -8.4, 4, 2_000)); // ~120km
    store.ingest(reading("d", 130, -8, 6, 3_000)); // far away

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

describe("the sequence around a pinned event", () => {
  const at = (minutes: number, magnitude: number, id: string): Reading => ({
    ...base,
    id,
    lon: 120.1,
    lat: -5.1,
    magnitude,
    time: NOW + minutes * 60_000,
  });

  it("orders neighbours in time and signs them against the pinned event", () => {
    const store = createStore(100);
    const pinned = store.ingest(at(0, 5.0, "p1")).quake;
    store.ingest(at(-90, 6.2, "a1"));
    store.ingest(at(-30, 4.1, "a2"));
    store.ingest(at(45, 4.4, "a3"));

    const near = findNearby(store, pinned, filters, NOW + 3_600_000);
    expect(near.sequence.map((e) => e.at / 60_000)).toEqual([-90, -30, 45]);
    expect(near.before).toBe(2);
    expect(near.after).toBe(1);
  });

  it("reports when the largest happened, which is what decides the reading", () => {
    const store = createStore(100);
    const pinned = store.ingest(at(0, 5.0, "p1")).quake;
    store.ingest(at(-90, 6.2, "big"));
    store.ingest(at(20, 4.9, "small"));

    const near = findNearby(store, pinned, filters, NOW + 3_600_000);
    // Larger, and already past: the pinned event is inside somebody else's sequence.
    expect(near.largest).toBe(6.2);
    expect(near.largestAt).toBe(-90 * 60_000);
  });

  it("is empty rather than absent when an event stands alone", () => {
    const store = createStore(100);
    const pinned = store.ingest(at(0, 5.0, "p1")).quake;
    const near = findNearby(store, pinned, filters, NOW);
    expect(near.sequence).toEqual([]);
    expect(near.largestAt).toBeNull();
  });
});

describe("stepping through a sequence", () => {
  const seq = (...entries: [string, number, number][]) =>
    entries.map(([key, at, magnitude]) => ({ key, at, magnitude }));

  it("takes the nearest event on each side in time, not the nearest in the list", () => {
    const { earlier, later } = stepsFrom(
      seq(
        ["far-past", -9_000, 5.1],
        ["just-before", -60, 2.4],
        ["just-after", 120, 3.3],
        ["far-future", 9_000, 6.0],
      ),
    );
    expect(earlier).toEqual({ key: "just-before", magnitude: 2.4 });
    expect(later).toEqual({ key: "just-after", magnitude: 3.3 });
  });

  it("has no earlier when this event opened the sequence", () => {
    const { earlier, later } = stepsFrom(seq(["after", 300, 4.0]));
    expect(earlier).toBeNull();
    expect(later).toEqual({ key: "after", magnitude: 4.0 });
  });

  it("has no later when this event closed it", () => {
    const { earlier, later } = stepsFrom(seq(["before", -300, 4.0]));
    expect(later).toBeNull();
    expect(earlier).toEqual({ key: "before", magnitude: 4.0 });
  });

  it("has neither when the event stands alone", () => {
    expect(stepsFrom([])).toEqual({ earlier: null, later: null });
  });

  it("refuses to call a neighbour sharing this instant earlier or later", () => {
    /*
     * An offset of zero is a neighbour at the same origin time. Putting it on one side would be
     * inventing an order the data does not have, so it is simply not a step.
     */
    expect(stepsFrom(seq(["same-instant", 0, 5.0]))).toEqual({ earlier: null, later: null });
  });

  it("does not care what order the list arrives in", () => {
    const forwards = stepsFrom(seq(["a", -100, 1], ["b", -10, 2], ["c", 10, 3], ["d", 100, 4]));
    const backwards = stepsFrom(seq(["d", 100, 4], ["c", 10, 3], ["b", -10, 2], ["a", -100, 1]));
    expect(forwards).toEqual(backwards);
    expect(forwards.earlier!.key).toBe("b");
    expect(forwards.later!.key).toBe("c");
  });
});
