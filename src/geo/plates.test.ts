import { describe, expect, it } from "vitest";
import { buildPlates, orderByProximity } from "./plates";

const segments = (a: Float32Array): string[] => {
  const out: string[] = [];
  for (let i = 0; i < a.length; i += 6) {
    out.push(Array.from(a.subarray(i, i + 6)).map((n) => n.toFixed(5)).join(","));
  }
  return out;
};

describe("plate boundaries", () => {
  const base = buildPlates();

  it("reorders without losing or duplicating a segment", () => {
    // The reveal is a growing draw range over a reordered buffer, so the settled picture is only
    // identical to the unordered one if this holds exactly.
    const ordered = orderByProximity(base, [{ lon: 120, lat: -5 }, { lon: -70, lat: -30 }]);
    expect(ordered.length).toBe(base.length);
    expect([...segments(ordered)].sort()).toEqual([...segments(base)].sort());
  });

  it("puts segments nearest an event first", () => {
    const ordered = orderByProximity(base, [{ lon: 120, lat: -5 }]);
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
    expect(orderByProximity(base, [])).toBe(base);
  });
});
