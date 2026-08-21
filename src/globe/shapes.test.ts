import { describe, expect, it } from "vitest";
import { spiral, volcano } from "./shapes";

const width = (p: readonly { lon: number }[]): number =>
  Math.max(...p.map((q) => q.lon)) - Math.min(...p.map((q) => q.lon));

describe("shapes stay shapes away from the equator", () => {
  it("widens a spiral in longitude as it goes north, because a degree there is shorter", () => {
    const equator = width(spiral(0, 0, 3));
    const iceland = width(spiral(0, 64, 3));
    expect(iceland).toBeGreaterThan(equator * 2);
  });

  it("stops widening near the pole instead of running away", () => {
    // Math.cos(90 degrees) is 6.1e-17, not zero, and 1/that is the bug this app has already had once.
    expect(width(spiral(0, 90, 3))).toBeLessThan(width(spiral(0, 0, 3)) * 4.01);
  });

  it("does not stretch the spiral in latitude, which is uniform", () => {
    const reach = (lat: number): number => Math.max(...spiral(0, lat, 3).map((q) => q.lat)) - lat;
    expect(reach(64)).toBeCloseTo(reach(0), 6);
  });

  it("starts the spiral at its own centre so the mark points at the storm", () => {
    const [first] = spiral(120, -15, 3);
    expect(first).toEqual({ lon: 120, lat: -15 });
  });
});

describe("the volcano is a triangle standing on its point", () => {
  it("puts its base on the given position, not its centre", () => {
    // Centred, half of every coastal volcano would be drawn in the sea, which is most of them.
    const p = volcano(15, 37.7, 1.6);
    expect(Math.min(...p.map((q) => q.lat))).toBeCloseTo(37.7, 6);
    expect(Math.max(...p.map((q) => q.lat))).toBeCloseTo(37.7 + 2.4, 6);
  });

  it("closes, so the outline is a triangle and not two sides of one", () => {
    const p = volcano(15, 37.7);
    expect(p[0]).toEqual(p[p.length - 1]);
  });

  it("stays a triangle in Iceland", () => {
    expect(width(volcano(0, 64, 1.6))).toBeGreaterThan(width(volcano(0, 0, 1.6)) * 2);
  });
});
