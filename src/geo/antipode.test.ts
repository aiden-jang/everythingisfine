import { describe, expect, it } from "vitest";
import { antipodeCross, antipodeOf, FRONT_ARCS, frontLengthKm, smallCircle } from "./antipode";
import { distanceKm, EARTH_RADIUS_KM } from "./sphere";

describe("the point on the far side", () => {
  it("is half the planet away, whatever the input", () => {
    for (const [lon, lat] of [
      [140, 38],
      [-70, -33],
      [0, 0],
      [12.5, 41.9],
    ] as const) {
      const a = antipodeOf(lon, lat);
      expect(distanceKm(lon, lat, a.lon, a.lat)).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 0);
    }
  });

  it("stays inside the range every other coordinate here uses", () => {
    // 140E flips to 40W, not to 320E, which would place it off the end of every longitude axis.
    expect(antipodeOf(140, 38)).toEqual({ lon: -40, lat: -38 });
    expect(antipodeOf(-40, -38)).toEqual({ lon: 140, lat: 38 });
    for (const lon of [-180, -179.9, 0, 179.9, 180]) {
      expect(Math.abs(antipodeOf(lon, 10).lon)).toBeLessThanOrEqual(180);
    }
  });

  it("is its own inverse", () => {
    const there = antipodeOf(23.7, -8.4);
    const back = antipodeOf(there.lon, there.lat);
    expect(back.lon).toBeCloseTo(23.7, 9);
    expect(back.lat).toBeCloseTo(-8.4, 9);
  });
});

describe("the front grows, turns over, and closes", () => {
  it("is the same length at 30 degrees and at 150", () => {
    // The whole argument, in one assertion: 20,015 km each.
    expect(frontLengthKm(30)).toBeCloseTo(frontLengthKm(150), 6);
    expect(Math.round(frontLengthKm(30))).toBe(20015);
  });

  it("is widest at the great circle, and exactly twice the 30-degree front", () => {
    expect(Math.round(frontLengthKm(90))).toBe(40030);
    expect(frontLengthKm(90) / frontLengthKm(30)).toBeCloseTo(2, 9);
  });

  it("closes to nothing on the far side", () => {
    expect(frontLengthKm(180)).toBeCloseTo(0, 6);
    expect(frontLengthKm(0)).toBeCloseTo(0, 6);
  });

  it("draws arcs symmetric about the great circle, so the turnover is visible not merely stated", () => {
    expect([...FRONT_ARCS]).toEqual([30, 60, 90, 120, 150]);
    const mirrored = FRONT_ARCS.map((a) => 180 - a).reverse();
    expect(mirrored).toEqual([...FRONT_ARCS]);
  });
});

describe("a circle on the sphere, not an ellipse around a point", () => {
  it("holds every point at the same arc distance from the centre", () => {
    const centre = { lon: 140, lat: 38 };
    for (const arc of [30, 90, 150]) {
      const want = (arc / 180) * Math.PI * EARTH_RADIUS_KM;
      for (const p of smallCircle(centre.lon, centre.lat, arc, 24)) {
        expect(distanceKm(centre.lon, centre.lat, p.lon, p.lat)).toBeCloseTo(want, 0);
      }
    }
  });

  it("closes, so the ring has no gap in it", () => {
    const ring = smallCircle(10, 20, 60, 36);
    expect(ring[0]!.lon).toBeCloseTo(ring[ring.length - 1]!.lon, 6);
    expect(ring[0]!.lat).toBeCloseTo(ring[ring.length - 1]!.lat, 6);
  });

  it("keeps every longitude in range even when the circle crosses the date line", () => {
    // Centred on the antimeridian, so most of the ring is on the far side of the seam.
    for (const p of smallCircle(179, 5, 40)) {
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThanOrEqual(180);
      expect(Number.isFinite(p.lat)).toBe(true);
    }
  });

  it("survives a circle drawn over a pole", () => {
    // Arc 30 from lat 75 puts part of the ring past the pole, where naive maths returns NaN.
    for (const p of smallCircle(0, 75, 30)) {
      expect(Number.isFinite(p.lon)).toBe(true);
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90.000001);
    }
  });

  it("is a great circle at 90 degrees, so it runs through both poles' latitudes", () => {
    // Centred on the equator, the 90-degree circle is a meridian pair: it must reach both poles.
    const lats = smallCircle(0, 0, 90).map((p) => p.lat);
    expect(Math.max(...lats)).toBeCloseTo(90, 1);
    expect(Math.min(...lats)).toBeCloseTo(-90, 1);
  });
});

describe("the mark on the far side", () => {
  it("is two crossed strokes centred on the point", () => {
    const cross = antipodeCross(-40, -38, 3);
    expect(cross).toHaveLength(2);
    const lats = cross.flat().map((p) => p.lat);
    expect(Math.max(...lats)).toBeCloseTo(-35, 6);
    expect(Math.min(...lats)).toBeCloseTo(-41, 6);
  });

  it("widens in longitude away from the equator, like every other glyph here", () => {
    const near = antipodeCross(0, 0)[0]!;
    const far = antipodeCross(0, 64)[0]!;
    expect(far[1]!.lon - far[0]!.lon).toBeGreaterThan((near[1]!.lon - near[0]!.lon) * 2);
  });

  it("does not run past the pole", () => {
    for (const p of antipodeCross(0, 89, 3).flat()) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
    }
  });
});
