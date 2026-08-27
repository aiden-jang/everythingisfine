import { describe, expect, it } from "vitest";
import { trendFrom } from "./nearby";
import { SECTION_DEFAULT_KM, sectionThrough } from "./section";
import { distanceKm } from "../geo/sphere";

/*
 * Offering a cross-section means choosing its orientation, and the orientation is the whole value of it.
 * Earthquakes at a subduction zone lie along the trench, so a slice across puts the slab on screen and a
 * slice along it is a smear. A fixed east-west section would be right at Japan and useless along the Aleutians.
 */

/** Second moments of a scatter, the way `findNearby` accumulates them inside its walk. */
const moments = (points: readonly [number, number][]) => {
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
  for (const [x, y] of points) {
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  return trendFrom(points.length, sx, sy, sxx, syy, sxy);
};

/** A line of `n` points through the origin at a maths angle, in the scaled degree space. */
const along = (deg: number, n = 9, spacing = 0.4): [number, number][] => {
  const r = (deg * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const t = (i - (n - 1) / 2) * spacing;
    return [t * Math.cos(r), t * Math.sin(r)] as [number, number];
  });
};

describe("the long axis of local seismicity", () => {
  it("reads an east-west line as a bearing of 90", () => {
    expect(moments(along(0))).toBeCloseTo(90, 6);
  });

  it("reads a north-south line as a bearing of 0", () => {
    expect(moments(along(90))).toBeCloseTo(0, 6);
  });

  it("reads a north-east line as 45, and a north-west line as 135", () => {
    expect(moments(along(45))).toBeCloseTo(45, 6);
    expect(moments(along(135))).toBeCloseTo(135, 6);
  });

  it("gives one answer for a line however it is walked, since a line has no direction", () => {
    // A trench running north-east runs south-west just as truly, so the bearing is modulo 180.
    expect(moments(along(45))).toBeCloseTo(moments(along(225))!, 6);
  });

  it("survives a perfectly straight line, whose minor axis is zero", () => {
    // The clearest possible trend, and the one a naive guard throws away: the subtraction that produces the
    // minor axis can land a rounding step below zero.
    expect(moments(along(30))).toBeCloseTo(60, 6);
  });

  it("refuses a round scatter, whose long axis is whichever way the noise fell", () => {
    const ring: [number, number][] = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    });
    expect(moments(ring)).toBeNull();
  });

  it("refuses too few points to fit anything to", () => {
    expect(moments(along(45, 4))).toBeNull();
    expect(moments([])).toBeNull();
  });

  it("measures spread about the centroid, not about the origin", () => {
    // The same line, moved bodily away from the pinned event. Measuring from the event instead would
    // inflate whichever axis the offset lay along and swing the answer.
    const shifted = along(20).map(([x, y]) => [x + 6, y + 6] as [number, number]);
    expect(moments(shifted)).toBeCloseTo(moments(along(20))!, 6);
  });
});

describe("the section it produces", () => {
  it("runs across the trend, not along it", () => {
    // A north-south trench gets an east-west slice, which is the one that crosses the slab.
    const line = sectionThrough(140, 38, 0);
    expect(line.fromLat).toBeCloseTo(38, 6);
    expect(line.toLat).toBeCloseTo(38, 6);
    expect(line.toLon).toBeGreaterThan(line.fromLon);
  });

  it("turns with the trend", () => {
    // An east-west trench gets a north-south slice.
    const line = sectionThrough(-155, 57, 90);
    expect(line.fromLon).toBeCloseTo(-155, 6);
    expect(line.toLon).toBeCloseTo(-155, 6);
    expect(Math.abs(line.toLat - line.fromLat)).toBeGreaterThan(4);
  });

  it("always reads west to east, so two margins are not drawn in opposite directions", () => {
    // The section plots distance from its first end, so which end is first decides which way the picture
    // reads. Left to the bearing that is an accident of the angle.
    for (const trend of [0, 20, 45, 80, 100, 135, 170]) {
      const line = sectionThrough(140, 38, trend);
      expect(line.toLon).toBeGreaterThan(line.fromLon);
    }
  });

  it("reads south to north when it runs neither east nor west", () => {
    // `sin` of 180 degrees is 1.2e-16, not 0, so this case only comes out right on purpose.
    const line = sectionThrough(-155, 57, 90);
    expect(line.toLat).toBeGreaterThan(line.fromLat);
  });

  it("falls back to west-to-east when there is no trend to cross", () => {
    // Not a guess dressed as a measurement: with no long axis every angle is equally arbitrary, and
    // this is the one the section is read in.
    const line = sectionThrough(0, 0, null);
    expect(line.fromLat).toBeCloseTo(0, 6);
    expect(line.toLat).toBeCloseTo(0, 6);
    expect(line.fromLon).toBeLessThan(line.toLon);
  });

  it("is the length it says it is, on the ground", () => {
    const line = sectionThrough(140, 38, 0);
    const km = distanceKm(line.fromLon, line.fromLat, line.toLon, line.toLat);
    // Within a percent: the endpoints are placed on a flat tangent and measured on the sphere.
    expect(Math.abs(km - SECTION_DEFAULT_KM) / SECTION_DEFAULT_KM).toBeLessThan(0.01);
  });

  it("keeps the length when the trend is diagonal and the latitude is high", () => {
    const line = sectionThrough(160, 53, 45);
    const km = distanceKm(line.fromLon, line.fromLat, line.toLon, line.toLat);
    expect(Math.abs(km - SECTION_DEFAULT_KM) / SECTION_DEFAULT_KM).toBeLessThan(0.02);
  });

  it("wraps rather than running off the end of the world", () => {
    // A section across the date line has to come out as a longitude that exists.
    const line = sectionThrough(179, 0, 0);
    expect(line.toLon).toBeGreaterThanOrEqual(-180);
    expect(line.toLon).toBeLessThanOrEqual(180);
    expect(line.toLon).toBeLessThan(0);
  });

  it("stays finite at the pole, where east-west degrees do not", () => {
    // `1/cos(lat)` is 11 at 85 degrees and infinite at 90. Unclamped, a section offered from a polar event
    // spans the whole planet or produces NaN.
    const line = sectionThrough(0, 89.9, 0);
    expect(Number.isFinite(line.fromLon)).toBe(true);
    expect(Number.isFinite(line.toLon)).toBe(true);
    expect(Math.abs(line.toLon)).toBeLessThanOrEqual(180);
  });
});
