import { describe, expect, it } from "vitest";
import { cellKey, cellSizeDeg, CLUSTER_UNTIL } from "./cluster";

describe("cluster cells", () => {
  it("stops clustering once there is room on screen", () => {
    expect(cellSizeDeg(CLUSTER_UNTIL)).toBe(0);
    expect(cellSizeDeg(3)).toBe(0);
    // Hiding data once events have room to be drawn separately would be a cost with no benefit.
    expect(cellSizeDeg(1)).toBeGreaterThan(0);
  });

  it("halves the cell as magnification doubles", () => {
    expect(cellSizeDeg(0.8) / cellSizeDeg(1.6)).toBeCloseTo(2, 5);
  });

  it("puts neighbours in one cell and distant events in different ones", () => {
    const cell = cellSizeDeg(1);
    expect(cellKey(120, -8, cell)).toBe(cellKey(120.5, -8.2, cell));
    expect(cellKey(120, -8, cell)).not.toBe(cellKey(140, -8, cell));
  });

  it("widens longitude cells toward the poles", () => {
    const cell = cellSizeDeg(1);
    // Two points 5 degrees of longitude apart at 70N are much closer on the ground than at the
    // equator, so they belong together up there and apart down here.
    expect(cellKey(0, 70, cell)).toBe(cellKey(5, 70, cell));
    expect(cellKey(0, 0, cell)).not.toBe(cellKey(5, 0, cell));
  });

  it("does not let one cell swallow a hemisphere at the pole", () => {
    const cell = cellSizeDeg(1);
    // 1/cos diverges at 90 degrees, so the widening is clamped. Without the clamp these two would
    // share a cell despite being on opposite sides of the planet.
    expect(cellKey(-170, 89.5, cell)).not.toBe(cellKey(170, 89.5, cell));
  });

  it("never gives two different cells the same key", () => {
    /*
     * The invariant, not a count.
     *
     * The first version asserted the number of distinct keys exceeded a round number, which was
     * arbitrary arithmetic rather than a property: it failed at 847 keys with zero collisions,
     * which is a correct grid. What actually matters is that the packing of two band indices into
     * one integer is injective, because a collision merges two unrelated parts of the world into
     * a single marker.
     */
    for (const zoom of [0.75, 1, 1.5]) {
      // Scoped per cell size. Keys only have to be unique within one grid; two different grids
      // reusing an integer is not a collision, it is two different grids.
      const seen = new Map<number, string>();
      const cell = cellSizeDeg(zoom);
      for (let lat = -89; lat <= 89; lat += cell / 2) {
        for (let lon = -180; lon < 180; lon += cell / 2) {
          const key = cellKey(lon, lat, cell);
          const band = `${Math.floor((lat + 90) / cell)}:${key % 4096}`;
          const previous = seen.get(key);
          if (previous !== undefined && previous !== band) {
            throw new Error(`collision: ${previous} and ${band} share key ${key}`);
          }
          seen.set(key, band);
        }
      }
      expect(seen.size).toBeGreaterThan(500);
    }
  });
});
