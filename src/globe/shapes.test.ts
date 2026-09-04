import { describe, expect, it } from "vitest";
import { flame, here, spiral, volcano, waves } from "./shapes";

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

describe("the wildfire flame", () => {
  it("stands on the point too, so a coastal fire is on land", () => {
    const p = flame(-52.7, -15.1, 1.2);
    expect(Math.min(...p.map((q) => q.lat))).toBeCloseTo(-15.1, 6);
  });

  it("leans, so it is a flame and not a leaf", () => {
    const p = flame(0, 0, 1.2);
    const tip = p.reduce((a, b) => (b.lat > a.lat ? b : a));
    expect(tip.lon).toBeGreaterThan(0);
  });

  it("closes its outline", () => {
    const p = flame(0, 0);
    expect(p[0]).toEqual(p[p.length - 1]);
  });

  it("is the same size whatever is burning, because size belongs to the ramp", () => {
    expect(width(flame(0, 0))).toBeCloseTo(width(flame(30, 0)), 6);
  });
});

describe("the flood waves", () => {
  it("is three separate strokes, not one path with connectors drawn", () => {
    const rows = waves(100, 18);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.length).toBeGreaterThan(4);
  });

  it("stacks the rows upward from the point", () => {
    const rows = waves(0, 0, 1.4);
    const mid = (r: readonly { lat: number }[]): number => r.reduce((s, p) => s + p.lat, 0) / r.length;
    expect(mid(rows[1]!)).toBeGreaterThan(mid(rows[0]!));
    expect(mid(rows[2]!)).toBeGreaterThan(mid(rows[1]!));
  });

  it("waves, rather than ruling three straight lines", () => {
    const row = waves(0, 0, 1.4)[0]!;
    const lats = row.map((p) => p.lat);
    expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(0.3);
  });

  it("stretches in longitude away from the equator like everything else", () => {
    expect(width(waves(0, 64)[0]!)).toBeGreaterThan(width(waves(0, 0)[0]!) * 2);
  });
});

describe("the reader's own mark", () => {
  it("is four separate strokes, not one closed shape", () => {
    // Four marks with one anchor, so the ticks keep pointing at the same spot as the globe turns.
    const ticks = here(10, 20);
    expect(ticks).toHaveLength(4);
    for (const t of ticks) expect(t).toHaveLength(2);
  });

  it("leaves the middle empty, which is the whole idea", () => {
    /*
     * The one mark here whose job is to say "that spot, there". A cross through the centre would cover
     * the ground it is identifying - including an earthquake at the same place, which is the coincidence
     * a reader would most want to see.
     */
    const ticks = here(0, 0, 2);
    for (const [inner] of ticks) {
      const away = Math.hypot(inner!.lon, inner!.lat);
      expect(away).toBeGreaterThan(0.4);
    }
  });

  it("points outward from the centre in four directions", () => {
    const ticks = here(0, 0, 2);
    const outer = ticks.map((t) => t[1]!);
    expect(outer.some((p) => p.lat > 1)).toBe(true);
    expect(outer.some((p) => p.lat < -1)).toBe(true);
    expect(outer.some((p) => p.lon > 1)).toBe(true);
    expect(outer.some((p) => p.lon < -1)).toBe(true);
  });

  it("widens in longitude near the poles, like every other glyph here", () => {
    // Longitude degrees shrink toward the poles, so a tick of fixed angular length has to stretch.
    const equator = here(0, 0, 2).map((t) => t[1]!.lon);
    const north = here(0, 70, 2).map((t) => t[1]!.lon);
    expect(Math.max(...north)).toBeGreaterThan(Math.max(...equator));
  });
});
