import { describe, expect, it } from "vitest";
import { graticule, spanDeg, toVec3 } from "./sphere";

/* The graticule, which had no test of any kind. See ARCHITECTURE.md#srcgeospheretestts. */

const RADIUS = 1.002;

describe("the graticule", () => {
  const grid = graticule(15, RADIUS);
  const vertices = grid.lonLat.length / 2;
  const at = (v: number) => ({ lon: grid.lonLat[v * 2]!, lat: grid.lonLat[v * 2 + 1]! });

  it("emits whole segments with a coordinate for every vertex", () => {
    expect(grid.position.length % 6).toBe(0);
    expect(grid.position.length / 3).toBe(vertices);
  });

  it("puts every vertex on the sphere it was asked for", () => {
    for (let i = 0; i < grid.position.length; i += 3) {
      expect(Math.hypot(grid.position[i]!, grid.position[i + 1]!, grid.position[i + 2]!)).toBeCloseTo(
        RADIUS,
        6,
      );
    }
  });

  it("carries a longitude and latitude that agree with the position", () => {
    /*
     * The map draws from `aLonLat` and the globe from the position. This layer is the reason longitude is
     * carried at all: recovering it with `atan2` collapsed every meridian's pole vertex onto the prime
     * meridian, because `atan2(0, 0)` is zero.
     */
    for (let v = 0; v < vertices; v += 31) {
      const { lon, lat } = at(v);
      const expected = toVec3(lon, lat, RADIUS);
      for (let k = 0; k < 3; k += 1) {
        expect(grid.position[v * 3 + k]!).toBeCloseTo(expected[k]!, 6);
      }
    }
  });

  it("never draws a segment across the world or over a pole", () => {
    // A parallel that joined +180 to -180 would be one line straight across the map. A meridian that
    // joined +90 to -90 would be a line through the planet.
    for (let v = 0; v < vertices; v += 2) {
      const a = at(v);
      const b = at(v + 1);
      expect(Math.abs(a.lon - b.lon)).toBeLessThanOrEqual(3.001);
      expect(Math.abs(a.lat - b.lat)).toBeLessThanOrEqual(3.001);
      expect(spanDeg(a.lon, a.lat, b.lon, b.lat)).toBeLessThan(3.001);
    }
  });

  it("runs its meridians all the way into both poles", () => {
    /*
     * They stopped three degrees short for a while, to dodge the `atan2` problem above. Carrying
     * longitude explicitly fixed the cause, and this holds the symptom fixed: a meridian ending at 87
     * leaves a gap at the top of the globe that reads as a rendering fault.
     */
    const lats = new Set([...Array(vertices).keys()].map((v) => at(v).lat));
    expect(lats.has(90)).toBe(true);
    expect(lats.has(-90)).toBe(true);
  });

  it("keeps its parallels clear of the poles, where they would be a dot", () => {
    const parallels = [...Array(vertices).keys()]
      .filter((v) => at(v).lat === at(v + (v % 2 === 0 ? 1 : -1)).lat)
      .map((v) => Math.abs(at(v).lat));
    expect(Math.max(...parallels)).toBeLessThanOrEqual(75);
  });

  it("draws the antimeridian once, not twice", () => {
    /*
     * A deliberate asymmetry rather than an oversight. There is a meridian at -180 and none at +180,
     * because on the globe they are the same line and drawing both would double its weight, and on the
     * map the copies put the next one's -180 exactly where this one's +180 is.
     */
    const meridians = new Set<number>();
    for (let v = 0; v < vertices; v += 2) {
      if (at(v).lon === at(v + 1).lon) meridians.add(at(v).lon);
    }
    expect(meridians.has(-180)).toBe(true);
    expect(meridians.has(180)).toBe(false);
  });

  it("spaces its meridians and parallels at the step it was given", () => {
    const grid30 = graticule(30, RADIUS);
    const lons = new Set<number>();
    for (let v = 0; v < grid30.lonLat.length / 2; v += 2) {
      const lon = grid30.lonLat[v * 2]!;
      if (lon === grid30.lonLat[(v + 1) * 2]!) lons.add(lon);
    }
    expect([...lons].sort((a, b) => a - b)).toEqual([
      -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150,
    ]);
  });

  it("has no NaN anywhere in it", () => {
    expect([...grid.position].every(Number.isFinite)).toBe(true);
    expect([...grid.lonLat].every(Number.isFinite)).toBe(true);
  });
});
