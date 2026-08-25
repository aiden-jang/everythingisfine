import { describe, expect, it } from "vitest";
import table from "./slab.json";
import { SLAB_MIN_DEPTH_KM, SLAB_MIN_MAGNITUDE, type SlabPoint } from "./slab";

/*
 * The committed table, checked against the claims the key makes about it.
 *
 * This is generated data, so the interesting failure is not a bug in a function: it is the file being
 * regenerated against a different query and the sentence beside it quietly becoming false. The key tells
 * a viewer these are magnitude 4.5 and up, below 300km, and nothing else - so that is what is asserted,
 * and a rerun of `tools/make-slab.mjs` with a changed threshold fails here rather than on the screen.
 */
const points = table as SlabPoint[];

describe("the deep seismicity table", () => {
  it("is big enough to be a shape rather than a scatter", () => {
    // The whole reason it exists: a real day carries two events this deep, which draws nothing.
    expect(points.length).toBeGreaterThan(1000);
  });

  it("holds only what the key says it holds", () => {
    for (const [lon, lat, depthKm, magnitude] of points) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(depthKm).toBeGreaterThanOrEqual(SLAB_MIN_DEPTH_KM);
      expect(magnitude).toBeGreaterThanOrEqual(SLAB_MIN_MAGNITUDE);
    }
  });

  it("stays inside the planet, which the sink divides by", () => {
    // 700km is deeper than any recorded earthquake. A depth past the centre would put a point on the
    // far hemisphere, where the facing test would then happily draw it.
    const deepest = points.reduce((a, b) => (b[2] > a[2] ? b : a));
    expect(deepest[2]).toBeLessThan(800);
  });

  it("is concentrated in subduction margins rather than spread over the globe", () => {
    /*
     * The claim the layer is built on: below 300km, only a descending plate makes earthquakes. If a
     * regeneration ever spread these evenly it would mean the depth filter had stopped working, and the
     * picture would be a dusting over the whole planet rather than a set of arcs.
     *
     * Tonga-Fiji alone should hold a large share. Measured at 1,048 of 1,583 when generated.
     */
    const tonga = points.filter(([lon, lat]) => lat > -30 && lat < -10 && (lon > 170 || lon < -170));
    expect(tonga.length / points.length).toBeGreaterThan(0.3);
  });

  it("is rounded to the precision the generator claims, not the feed's", () => {
    // Two decimals of position is about a kilometre, finer than the location error at these depths.
    for (const [lon, lat, depthKm] of points.slice(0, 200)) {
      expect(Number(lon.toFixed(2))).toBe(lon);
      expect(Number(lat.toFixed(2))).toBe(lat);
      expect(Number.isInteger(depthKm)).toBe(true);
    }
  });
});
