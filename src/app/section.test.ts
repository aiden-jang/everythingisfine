import { describe, expect, it } from "vitest";
import { buildSection, plateCrossings, sectionLengthKm } from "./section";
import { createStore } from "../data/store";
import { DEFAULT_FILTERS } from "./feed";
import type { Reading } from "../data/types";

/*
 * The section is the one view where being slightly wrong is invisible: a slab drawn at the wrong dip still
 * looks like a slab, and an offset with the wrong sign still fills the corridor. So the geometry is checked
 * against distances that can be worked out by hand.
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
    // Clamping is the tempting version and it invents structure: every event in the wider region lands on
    // one of the two edges as a vertical stack that reads like a fault.
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

/*
 * Where the line crosses a plate boundary. The tick turns the section from a shape into an explanation, so a
 * wrong one is worse than none.
 *
 * The far side of the planet looks like it needs guarding and does not: the great circle through the two ends
 * is a whole circle, so boundaries cross it everywhere, and everywhere but the section lands outside nought
 * to length. Asserted below rather than assumed, since the first version carried a distance guard.
 */
describe("plate boundaries along a section", () => {
  const crossings = (
    fromLon: number, fromLat: number, toLon: number, toLat: number,
  ): { length: number; at: number[] } => {
    const line = { fromLon, fromLat, toLon, toLat };
    const length = sectionLengthKm(line);
    return { length, at: plateCrossings(line, length) };
  };

  it("finds the Japan Trench where it is", () => {
    // Due east across Honshu at 36N. The trench is around 143E, a little past halfway.
    const { length, at } = crossings(138, 36, 146, 36);
    expect(Math.round(length)).toBe(719);
    expect(at.some((km) => km > 380 && km < 460)).toBe(true);
  });

  it("finds none in the middle of a plate", () => {
    // Open Pacific, a thousand kilometres from any edge, and its antipode is in the Indian Ocean where
    // there are edges: the range check is what keeps those out.
    expect(crossings(-150, 20, -140, 20).at).toEqual([]);
  });

  it("reports a crossing only where the boundary is actually near the line", () => {
    // The invariant behind the range check: every tick has to sit where a boundary vertex sits, within one
    // simplified segment. Swept over the globe, because a single lucky line proves nothing about a circle.
    for (let lon = -180; lon < 180; lon += 23) {
      for (let lat = -50; lat <= 50; lat += 25) {
        const line = { fromLon: lon, fromLat: lat, toLon: lon + 6, toLat: lat + 4 };
        const length = sectionLengthKm(line);
        for (const km of plateCrossings(line, length)) {
          expect(km, `${lon},${lat}`).toBeGreaterThanOrEqual(0);
          expect(km, `${lon},${lat}`).toBeLessThanOrEqual(length);
        }
      }
    }
  });

  it("returns crossings inside the section, in order", () => {
    const { length, at } = crossings(120, 20, 150, 45);
    expect(at.length).toBeGreaterThan(0);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    for (const km of at) {
      expect(km).toBeGreaterThanOrEqual(0);
      expect(km).toBeLessThanOrEqual(length);
    }
  });

  it("comes back on the section itself, not only on its geometry", () => {
    // Reached through the built section, since that is how the panel gets it and a helper nobody calls
    // is a helper that can quietly stop being called.
    const s = buildSection(
      storeWith([]), { fromLon: 138, fromLat: 36, toLon: 146, toLat: 36 }, DEFAULT_FILTERS, NOW,
    );
    expect(s.crossings.length).toBeGreaterThan(0);
  });
});

describe("the slab in the section", () => {
  // `[lon, lat, depthKm, magnitude]`, the shape `geo/slab.json` ships. Placed by hand so the corridor test
  // checks geometry rather than whatever the committed table happens to contain.
  const LINE = { fromLon: 0, fromLat: 0, toLon: 10, toLat: 0 } as const;

  it("keeps what is inside the corridor and drops what is not", () => {
    const s = buildSection(storeWith([]), LINE, DEFAULT_FILTERS, NOW, 200, [
      [5, 0, 400, 5],
      // ~555km off the line, which is well past the 200km half-width.
      [5, 5, 400, 5],
      // Past the far end of the line, so on the geometry but not on the section.
      [20, 0, 400, 5],
    ]);
    expect(s.slab.length).toBe(1);
    expect(s.slab[0]!.depthKm).toBe(400);
    expect(Math.abs(s.slab[0]!.offsetKm)).toBeLessThan(200);
  });

  it("lets the slab set the floor, because the axis has to hold what is drawn", () => {
    // The whole point of the layer: an empty window still gets a 400km axis rather than a 70km one.
    const shallow = buildSection(storeWith([]), LINE, DEFAULT_FILTERS, NOW, 200, []);
    const deep = buildSection(storeWith([]), LINE, DEFAULT_FILTERS, NOW, 200, [[5, 0, 400, 5]]);
    expect(shallow.deepestKm).toBeLessThan(400);
    expect(deep.deepestKm).toBe(400);
  });

  it("draws nothing extra when the layer is off, which is how the panel asks", () => {
    // The toggle is expressed as an empty table rather than a flag, so this is the off state.
    expect(buildSection(storeWith([]), LINE, DEFAULT_FILTERS, NOW, 200, []).slab).toEqual([]);
  });
});
