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
     * The invariant, not a count. Asserting that distinct keys exceed a round number failed at 847 keys with
     * zero collisions, which is a correct grid. What matters is that packing two band indices into one
     * integer is injective, because a collision merges two unrelated parts of the world into one marker.
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

/*
 * The third of the seam audit: markers. A marker is a point, so it has no geometry to be wrong at the
 * antimeridian. What can be wrong is the grid that decides whether two of them are one, and the Ring of Fire
 * crosses 180 degrees twice.
 */
describe("clustering across the antimeridian", () => {
  const CELL = 3.2;

  it("cuts the grid at 180, which every cell edge also does", () => {
    // Two events either side of the date line land in different cells. That is not the bug: two events either
    // side of any cell edge land in different cells, which is what a grid is.
    expect(cellKey(179.9, -18, CELL)).not.toBe(cellKey(-179.9, -18, CELL));
    /*
     * The same separation mid-ocean, straddling an ordinary edge. The edge has to be found from the widened
     * cell, not from `CELL`: longitude cells stretch by 1/cos(lat), so at latitude -18 they are 3.3647 degrees
     * and a boundary computed from the base figure is not a boundary at all.
     */
    const widen = Math.min(8, 1 / Math.max(0.125, Math.cos((-18 * Math.PI) / 180)));
    const lonCell = CELL * widen;
    const edge = Math.ceil((-140 + 180) / lonCell) * lonCell - 180;
    expect(cellKey(edge - 0.05, -18, CELL)).not.toBe(cellKey(edge + 0.05, -18, CELL));
  });

  it("merges pairs at the seam as readily as anywhere else", () => {
    // The property that would have been the bug: sliding a fixed-separation pair across a region and counting
    // how often it merges. 90.0 percent straddling 180 against 90.0 percent mid-Pacific.
    const wrap = (v: number): number => ((((v + 180) % 360) + 360) % 360) - 180;
    const rate = (centre: number): number => {
      let merged = 0;
      let n = 0;
      for (let o = -6; o <= 6; o += 0.02) {
        n += 1;
        if (cellKey(wrap(centre + o), -18, CELL) === cellKey(wrap(centre + o + 0.4), -18, CELL)) {
          merged += 1;
        }
      }
      return merged / n;
    };
    expect(Math.abs(rate(180) - rate(-140))).toBeLessThan(0.06);
  });

  it("keeps the band at the seam the same width as its neighbours, near enough", () => {
    // The one thing that is seam-specific. 360 degrees is not a whole number of widened cells, so the last
    // band is a runt: 3.344 against 3.365 at latitude -18, worth an assertion only so it cannot grow.
    const widen = Math.min(8, 1 / Math.max(0.125, Math.cos((-18 * Math.PI) / 180)));
    const lonCell = CELL * widen;
    const runt = ((360 / lonCell) % 1) * lonCell;
    expect(Math.abs(runt - lonCell) / lonCell).toBeLessThan(0.05);
  });

  it("never lets two distant cells collide onto one key", () => {
    // The key packs latitude and longitude bands into one integer with 4096 of room for the longitude
    // side. The tightest cell the app ever uses is 1.68 degrees, which is 215 bands at the equator.
    const tightest = 3.2 / 1.9;
    expect(360 / tightest).toBeLessThan(4096);
    expect(cellKey(-180, -90, tightest)).not.toBe(cellKey(180, -90 + tightest, tightest));
  });
});
