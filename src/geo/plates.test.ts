import { describe, expect, it } from "vitest";
import { buildPlates, orderByProximity, RADIUS_PLATES } from "./plates";
import { spanDeg, toVec3 } from "./sphere";

const segments = (a: Float32Array): string[] => {
  const out: string[] = [];
  for (let i = 0; i < a.length; i += 6) {
    out.push(
      Array.from(a.subarray(i, i + 6))
        .map((n) => n.toFixed(5))
        .join(","),
    );
  }
  return out;
};

describe("plate boundaries", () => {
  const base = buildPlates().position;

  it("reorders without losing or duplicating a segment", () => {
    // The reveal is a growing draw range over a reordered buffer, so the settled picture is only
    // identical to the unordered one if this holds exactly.
    const ordered = orderByProximity(base, [
      { lon: 120, lat: -5 },
      { lon: -70, lat: -30 },
    ]).position;
    expect(ordered.length).toBe(base.length);
    expect([...segments(ordered)].sort()).toEqual([...segments(base)].sort());
  });

  it("puts segments nearest an event first", () => {
    const ordered = orderByProximity(base, [{ lon: 120, lat: -5 }]).position;
    const distanceOf = (i: number): number => {
      const mx = (ordered[i * 6]! + ordered[i * 6 + 3]!) / 2;
      const my = (ordered[i * 6 + 1]! + ordered[i * 6 + 4]!) / 2;
      const mz = (ordered[i * 6 + 2]! + ordered[i * 6 + 5]!) / 2;
      const len = Math.hypot(mx, my, mz);
      const phi = (-5 * Math.PI) / 180;
      const lam = (120 * Math.PI) / 180;
      const c = Math.cos(phi);
      const ex = c * Math.sin(lam);
      const ey = Math.sin(phi);
      const ez = c * Math.cos(lam);
      return Math.hypot(mx / len - ex, my / len - ey, mz / len - ez);
    };
    const last = ordered.length / 6 - 1;
    expect(distanceOf(0)).toBeLessThan(distanceOf(last));
    expect(distanceOf(0)).toBeLessThan(0.2);
  });

  it("leaves the buffer alone when there is nothing to grow from", () => {
    expect(orderByProximity(base, []).position).toBe(base);
  });
});

/* The seam audit, matching the one the land mesh already had. The plate lines and the graticule cross the
   same antimeridian and had no geometry test between them. See ARCHITECTURE.md. */
describe("the plate geometry, at the seam and elsewhere", () => {
  const built = buildPlates();

  it("emits whole segments, with a longitude and latitude for every vertex", () => {
    expect(built.position.length % 6).toBe(0);
    expect(built.position.length / 3).toBe(built.lonLat.length / 2);
    expect(built.position.length / 6).toBeGreaterThan(1000);
  });

  it("puts every vertex on the sphere it belongs to", () => {
    for (let i = 0; i < built.position.length; i += 3) {
      const r = Math.hypot(built.position[i]!, built.position[i + 1]!, built.position[i + 2]!);
      expect(r).toBeCloseTo(RADIUS_PLATES, 5);
    }
  });

  it("carries a longitude and latitude that agree with the position", () => {
    // The map reads `aLonLat` and the globe reads the position, so a vertex whose two forms disagree is drawn
    // in one place on the globe and another on the map.
    for (let v = 0; v < built.lonLat.length / 2; v += 97) {
      const [x, y, z] = [built.position[v * 3]!, built.position[v * 3 + 1]!, built.position[v * 3 + 2]!];
      const expected = toVec3(built.lonLat[v * 2]!, built.lonLat[v * 2 + 1]!, RADIUS_PLATES);
      expect(x).toBeCloseTo(expected[0]!, 5);
      expect(y).toBeCloseTo(expected[1]!, 5);
      expect(z).toBeCloseTo(expected[2]!, 5);
    }
  });

  it("never draws a segment across the world", () => {
    // The failure this guards is one line: a boundary leaving at +180 and re-entering at -180 drawn as
    // a single segment, which on the map is a hairline straight across it and on the globe is a chord
    // through the planet.
    for (let v = 0; v < built.lonLat.length / 2; v += 2) {
      const gap = Math.abs(built.lonLat[v * 2]! - built.lonLat[(v + 1) * 2]!);
      expect(gap).toBeLessThan(180);
    }
  });

  it("keeps every segment short in arc, which is what the chord sag depends on", () => {
    // In arc and not in longitude, and the distinction is the whole of it. The widest longitude gap is 18.3
    // degrees at latitude 85.8, which is 1.34 degrees of arc. Densifying on longitude would split polar
    // segments twelve ways for nothing.
    for (let v = 0; v < built.lonLat.length / 2; v += 2) {
      const a = [built.lonLat[v * 2]!, built.lonLat[v * 2 + 1]!] as const;
      const b = [built.lonLat[(v + 1) * 2]!, built.lonLat[(v + 1) * 2 + 1]!] as const;
      expect(spanDeg(a[0], a[1], b[0], b[1])).toBeLessThan(1.6);
    }
  });

  it("drops a crossing rather than drawing it, on data that contains one", () => {
    // Nothing in the committed simplification reaches the guard - the widest step is 18.3 degrees against a
    // threshold of 170 - so it is fed a crossing directly. A precaution no test exercises gets deleted.
    const crossing = buildPlates([
      [
        [179, 10],
        [-179, 10],
      ],
    ]);
    expect(crossing.position.length).toBe(0);
    const ordinary = buildPlates([
      [
        [179, 10],
        [179.5, 10],
      ],
    ]);
    expect(ordinary.position.length).toBeGreaterThan(0);
  });

  it("has no NaN anywhere in it", () => {
    // One NaN in a position buffer takes out the whole draw call rather than one vertex of it.
    expect([...built.position].every(Number.isFinite)).toBe(true);
    expect([...built.lonLat].every(Number.isFinite)).toBe(true);
  });
});
