import { describe, expect, it } from "vitest";
import { createStore } from "../data/store";
import { countByRegion, contains, REGIONS } from "./regions";
import type { Filters, Reading } from "../data/types";

/*
 * The gate for PLAN.md step 9.
 *
 * The polish doc calls losing a pinned selection on refresh the most infuriating possible bug in a
 * live visualization, and says it is easy to write by accident. It is: the accident is holding the
 * selection as an object or an index instead of a key, and it only shows up once a refresh lands
 * while someone happens to be reading the panel.
 *
 * So the property is asserted directly against the store, which is where it is actually decided.
 */

const reading = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs", id: "a1", magnitude: 5.2, scale: "Mww", lon: 141.3, lat: 41.8, depthKm: 40,
  time: 1_700_000_000_000, place: "40 km E of Hakodate", kind: "earthquake",
  receivedAt: 1_700_000_020_000, ...over,
});

describe("a pinned selection survives", () => {
  it("a poll that re-delivers the same events", () => {
    const store = createStore(100);
    const pinned = store.ingest(reading()).quake.key;

    // Three more polls of the same feed, exactly as USGS republishes it.
    for (let i = 0; i < 3; i += 1) store.ingest(reading());

    expect(store.get(pinned)).toBeDefined();
    expect(store.get(pinned)!.primary.id).toBe("a1");
  });

  it("the agency revising the event's magnitude underneath it", () => {
    const store = createStore(100);
    const pinned = store.ingest(reading()).quake.key;
    store.ingest(reading({ magnitude: 5.8, scale: "Mww" }));

    const after = store.get(pinned);
    expect(after).toBeDefined();
    // Still the same selection, showing the new number. The panel updates; it does not close.
    expect(after!.primary.magnitude).toBe(5.8);
  });

  it("the second agency arriving and corroborating it", () => {
    const store = createStore(100);
    const pinned = store.ingest(reading()).quake.key;
    store.ingest(reading({ source: "emsc", id: "e9", magnitude: 4.9, scale: "mb", lon: 141.44 }));

    const after = store.get(pinned)!;
    expect(after.readings).toHaveLength(2);
    // The key is stable across a merge, which is the case most likely to be written wrong: the
    // merge rewrites the quake's contents and it would be easy to rewrite its identity too.
    expect(after.key).toBe(pinned);
  });

  it("hundreds of unrelated events arriving after it", () => {
    const store = createStore(500);
    const pinned = store.ingest(reading()).quake.key;
    for (let i = 0; i < 400; i += 1) {
      store.ingest(reading({ id: `u${i}`, lon: -120 + i / 10, lat: 35, time: 1_700_000_100_000 + i }));
    }
    expect(store.get(pinned)).toBeDefined();
  });

  it("but not eviction, which is the one case that must clear it", () => {
    const store = createStore(10);
    const pinned = store.ingest(reading()).quake.key;
    for (let i = 0; i < 20; i += 1) {
      store.ingest(reading({ id: `u${i}`, lon: -120 + i, lat: 35, time: 1_700_000_100_000 + i }));
    }
    // Genuinely gone, so the panel closing is correct rather than a lost selection. The interface
    // clears the pin only on this, never on a refresh.
    expect(store.get(pinned)).toBeUndefined();
  });
});

describe("regions", () => {
  const filters: Filters = {
    minMagnitude: 0, windowMs: 24 * 3_600_000, sources: new Set(["usgs", "emsc"]),
  };
  const now = 1_700_000_000_000;

  it("counts an event into the margin it happened in", () => {
    const store = createStore(50);
    store.ingest(reading({ lon: 142, lat: 38 }));       // Japan
    store.ingest(reading({ id: "b", lon: -71, lat: -33 })); // Chile
    store.ingest(reading({ id: "c", lon: -70.5, lat: -30 }));

    const counts = countByRegion(store, filters, now);
    const by = (name: string): number => counts.find((c) => c.region.name === name)!.count;
    expect(by("Japan & Kurils")).toBe(1);
    expect(by("Chile & Peru")).toBe(2);
    expect(counts[0]!.count).toBe(2); // largest first
  });

  it("handles a box that crosses the antimeridian", () => {
    const tonga = REGIONS.find((r) => r.name === "Tonga & Kermadec")!;
    // The box runs from 180W to 170W, so a naive `lon >= west && lon <= east` finds nothing.
    expect(contains(tonga, -175, -22)).toBe(true);
    expect(contains(tonga, 100, -22)).toBe(false);

    const aleutians = REGIONS.find((r) => r.name === "Alaska & Aleutians")!;
    expect(contains(aleutians, -160, 55)).toBe(true);
  });

  it("respects the filter, so a region empties when the slider rises", () => {
    const store = createStore(50);
    store.ingest(reading({ lon: 142, lat: 38, magnitude: 2 }));
    store.ingest(reading({ id: "b", lon: 143, lat: 39, magnitude: 6 }));

    const low = countByRegion(store, filters, now).find((c) => c.region.name === "Japan & Kurils")!;
    const high = countByRegion(store, { ...filters, minMagnitude: 5 }, now)
      .find((c) => c.region.name === "Japan & Kurils")!;
    expect(low.count).toBe(2);
    expect(high.count).toBe(1);
  });
});
