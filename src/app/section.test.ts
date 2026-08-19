import { describe, expect, it } from "vitest";
import { buildSection, sectionLengthKm } from "./section";
import { createStore } from "../data/store";
import { DEFAULT_FILTERS } from "./feed";
import type { Reading } from "../data/types";

/*
 * The section is the one view where being slightly wrong is invisible.
 *
 * A slab drawn at the wrong dip still looks like a slab, and an offset with the wrong sign still
 * fills the corridor. So the geometry is checked against distances that can be worked out by hand:
 * a degree of latitude, a quarter of the equator, and a point known to be off to one side.
 */

const NOW = Date.UTC(2026, 0, 2, 12);

function reading(lon: number, lat: number, depthKm: number, magnitude = 4): Reading {
  return {
    source: "usgs",
    id: `${lon},${lat},${depthKm}`,
    time: NOW - 60_000,
    lon,
    lat,
    depthKm,
    magnitude,
    scale: "mb",
    place: "Nowhere",
    kind: "earthquake",
    receivedAt: NOW,
  };
}

function storeWith(readings: Reading[]): ReturnType<typeof createStore> {
  const store = createStore(1000);
  for (const r of readings) store.ingest(r);
  return store;
}

describe("a cross-section", () => {
  it("measures its own length along the great circle", () => {
    // One degree of latitude is a nautical-mile definition: 60 nmi, 111.19 km.
    expect(sectionLengthKm({ fromLon: 0, fromLat: 0, toLon: 0, toLat: 1 })).toBeCloseTo(111.19, 1);
    // A quarter turn, whichever way it is drawn.
    expect(sectionLengthKm({ fromLon: 0, fromLat: 0, toLon: 90, toLat: 0 })).toBeCloseTo(10007.5, 0);
    expect(sectionLengthKm({ fromLon: 0, fromLat: 90, toLon: 0, toLat: 0 })).toBeCloseTo(10007.5, 0);
  });

  it("places an event by how far along the line it is", () => {
    const store = storeWith([reading(0, 5, 30), reading(0, 1, 10)]);
    const s = buildSection(
      store, { fromLon: 0, fromLat: 0, toLon: 0, toLat: 10 }, DEFAULT_FILTERS, NOW,
    );
    const along = s.points.map((p) => Math.round(p.alongKm)).sort((a, b) => a - b);
    expect(along).toEqual([111, 556]);
    expect(s.points.every((p) => Math.abs(p.offsetKm) < 0.001)).toBe(true);
    expect(s.deepestKm).toBe(30);
  });

  it("drops what is beyond either end rather than piling it on the ends", () => {
    /*
     * Clamping is the tempting version and it invents structure: every event in the wider region
     * lands on one of the two edges as a vertical stack that reads like a fault.
     */
    const store = storeWith([
      reading(0, -3, 10), // before the start
      reading(0, 13, 10), // past the end
      reading(0, 5, 10), // on it
    ]);
    const s = buildSection(
      store, { fromLon: 0, fromLat: 0, toLon: 0, toLat: 10 }, DEFAULT_FILTERS, NOW,
    );
    expect(s.points).toHaveLength(1);
    expect(Math.round(s.points[0]!.alongKm)).toBe(556);
  });

  it("keeps the corridor, and keeps which side of it a point is on", () => {
    // The line runs due north up the prime meridian, so east is a positive offset and west negative
    // for one of the two cross-product orientations. Which one matters less than that they differ.
    const store = storeWith([reading(1, 5, 10), reading(-1, 5, 10), reading(4, 5, 10)]);
    const s = buildSection(
      store, { fromLon: 0, fromLat: 0, toLon: 0, toLat: 10 }, DEFAULT_FILTERS, NOW, 200,
    );
    // 4 degrees of longitude at 5 north is about 443km, well outside the corridor.
    expect(s.points).toHaveLength(2);
    const offsets = s.points.map((p) => p.offsetKm);
    expect(Math.sign(offsets[0]!)).toBe(-Math.sign(offsets[1]!));
    expect(Math.abs(offsets[0]!)).toBeCloseTo(110.9, 0);
  });

  it("counts what it cannot plot instead of dropping it quietly", () => {
    const store = storeWith([reading(0, 5, Number.NaN), reading(0, 6, 20)]);
    const s = buildSection(
      store, { fromLon: 0, fromLat: 0, toLon: 0, toLat: 10 }, DEFAULT_FILTERS, NOW,
    );
    expect(s.points).toHaveLength(1);
    expect(s.withoutDepth).toBe(1);
  });

  it("works across the date line, where a naive difference of longitudes would not", () => {
    const store = storeWith([reading(179, 0, 10), reading(-179, 0, 20)]);
    const line = { fromLon: 175, fromLat: 0, toLon: -175, toLat: 0 };
    expect(sectionLengthKm(line)).toBeCloseTo(1112, 0);
    const s = buildSection(store, line, DEFAULT_FILTERS, NOW);
    expect(s.points).toHaveLength(2);
    const along = s.points.map((p) => Math.round(p.alongKm)).sort((a, b) => a - b);
    expect(along).toEqual([445, 667]);
  });
});
