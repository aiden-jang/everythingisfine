import { describe, expect, it } from "vitest";
import { boundarySegments, nearestBoundaryKm, toSegments, type Segment } from "./boundaryDistance";
import { distanceKm } from "./sphere";

/** A single straight run of "boundary" along the equator, 20 degrees long. */
const equator: [number, number][][] = [
  [
    [0, 0],
    [10, 0],
    [20, 0],
  ],
];
const segs = toSegments(equator);

describe("distance to the nearest boundary", () => {
  it("is zero on the line", () => {
    expect(nearestBoundaryKm(10, 0, segs)!).toBeCloseTo(0, 6);
  });

  it("measures to the segment, not to the nearest vertex", () => {
    /* The bug that made the first measurement of this feature wrong. See ARCHITECTURE.md#srcgeoboundarydistancetestts. */
    const mid = nearestBoundaryKm(5, 0, segs)!;
    expect(mid).toBeCloseTo(0, 6);
    expect(distanceKm(5, 0, 0, 0)).toBeGreaterThan(500);
  });

  it("is the perpendicular distance for a point off the line", () => {
    // One degree of latitude is 111.2 km, and the nearest point is straight down the meridian.
    expect(nearestBoundaryKm(10, 1, segs)!).toBeCloseTo(111.2, 0);
    expect(nearestBoundaryKm(10, -3, segs)!).toBeCloseTo(333.6, 0);
  });

  it("clamps to the endpoints rather than running off the end of the line", () => {
    // 10 degrees east of the last vertex: the answer is the distance to that vertex, not to the great
    // circle the segment lies on, which would read zero.
    expect(nearestBoundaryKm(30, 0, segs)!).toBeCloseTo(distanceKm(30, 0, 20, 0), 0);
  });

  it("takes the nearest of several boundaries", () => {
    /* 119.7 km, not the 111.2 that one degree of latitude would suggest, and the difference is the point.
       See ARCHITECTURE.md#srcgeoboundarydistancetestts. */
    const two = toSegments([
      [
        [0, 0],
        [20, 0],
      ],
      [
        [0, 5],
        [20, 5],
      ],
    ]);
    expect(nearestBoundaryKm(10, 4, two)!).toBeCloseTo(119.7, 0);
  });

  it("bulges the way a great circle does, not the way a parallel looks on a map", () => {
    const arc = toSegments([
      [
        [0, 5],
        [20, 5],
      ],
    ]);
    // On the arc's own latitude at its midpoint, and still 8.5 km south of it.
    expect(nearestBoundaryKm(10, 5, arc)!).toBeCloseTo(8.6, 0);
    // At its endpoints the arc really is at latitude 5.
    expect(nearestBoundaryKm(0, 5, arc)!).toBeCloseTo(0, 6);
  });

  it("has no answer when there are no boundaries, rather than a zero", () => {
    expect(nearestBoundaryKm(10, 0, [])).toBeNull();
  });
});

describe("preparing the segments", () => {
  it("drops a leg that wraps the antimeridian, like the boundary renderer does", () => {
    // Joining 179 to -179 is a line straight across the map and a chord through the planet.
    expect(
      toSegments([
        [
          [179, 0],
          [-179, 0],
        ],
      ]),
    ).toHaveLength(0);
    expect(
      toSegments([
        [
          [179, 0],
          [179.5, 0],
        ],
      ]),
    ).toHaveLength(1);
  });

  it("makes one segment per pair, not per point", () => {
    expect(segs).toHaveLength(2);
  });

  it("ignores a line with nothing to join", () => {
    expect(toSegments([[[0, 0]]])).toHaveLength(0);
    expect(toSegments([])).toHaveLength(0);
  });

  it("writes unit vectors, so the hot loop has no trigonometry in it", () => {
    for (const s of segs as Segment[]) {
      expect(Math.hypot(s.ax, s.ay, s.az)).toBeCloseTo(1, 9);
      expect(Math.hypot(s.bx, s.by, s.bz)).toBeCloseTo(1, 9);
    }
  });
});

describe("against the real boundary file", () => {
  it("puts a known intraplate event thousands of km out and a trench event on the line", () => {
    const real = boundarySegments();
    expect(real.length).toBeGreaterThan(1000);
    // Pahala, Hawaii: a hotspot in the middle of the Pacific plate, the textbook intraplate case.
    expect(nearestBoundaryKm(-155.47, 19.2, real)!).toBeGreaterThan(3000);
    // Off the coast of northern Chile, on the Nazca-South America trench.
    expect(nearestBoundaryKm(-70.9, -22.5, real)!).toBeLessThan(200);
  });
});
