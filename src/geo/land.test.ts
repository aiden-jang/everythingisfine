import { describe, expect, it } from "vitest";
import { buildLand, recentre, rings, unwrap } from "./land";

describe("the land mesh", () => {
  const land = buildLand();

  it("winds every triangle outward, so back-face culling can hide the far side", () => {
    /*
     * The fill is drawn without a depth test, so culling is the only thing hiding the far hemisphere.
     * A triangle wound the wrong way survives on the far side and vanishes on the near one, which
     * reads as the globe being slightly transparent rather than as a bug.
     */
    let inward = 0;
    const p = land.position;
    for (let i = 0; i < land.index.length; i += 3) {
      const a = land.index[i]! * 3;
      const b = land.index[i + 1]! * 3;
      const c = land.index[i + 2]! * 3;
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * p[a]! + ny * p[a + 1]! + nz * p[a + 2]! < 0) inward += 1;
    }
    expect(inward).toBe(0);
  });

  it("had a real problem to fix, rather than a precaution", () => {
    // If the source ever becomes consistent this drops to zero, and the pass above can go.
    expect(land.flipped).toBeGreaterThan(0);
  });
});

/*
 * The date line, in the ring rather than in the picture.
 *
 * Three Natural Earth rings hold both +180 and -180, the largest being the 1,320-point Eurasia ring,
 * which crosses the antimeridian exactly twice: out at 178.6E and back at 180W. Read literally that
 * ring teleports across the world halfway round its own coastline, which makes it self-intersecting
 * in longitude and latitude, and earcut promises nothing about a polygon that is not simple. It
 * emitted wedges a hundred and fifty degrees long and a quarter of a degree thick: no area to speak
 * of, invisible on a globe where longitude is compressed at those latitudes, and a hairline drawn
 * across the ocean the moment the map existed.
 *
 * Tested on the ring rather than on the mesh because the mesh cannot tell the difference. An ordinary
 * earcut needle over Kazakhstan spans 16 degrees and one out of the date line spanned 19, so no
 * threshold on triangle width separates a wedge from the triangulation working normally.
 */
describe("unwrapping a ring at the date line", () => {
  it("leaves an ordinary ring alone", () => {
    const ring = [[10, 0], [20, 5], [15, 10]] as [number, number][];
    expect(unwrap(ring).ring).toEqual(ring);
  });

  it("runs a crossing past 180 rather than jumping back", () => {
    const { ring } = unwrap([[178, 60], [-179, 61], [-176, 62], [179, 59]]);
    const lons = ring.map(([lon]) => lon!);
    expect(lons).toEqual([178, 181, 184, 179]);
    // The property that matters: nothing downstream sees a step wider than half the world.
    for (let i = 0; i < lons.length; i += 1) {
      const step = Math.abs(lons[(i + 1) % lons.length]! - lons[i]!);
      expect(step).toBeLessThan(180);
    }
  });

  it("brings a ring that unwrapped a whole turn away back into frame", () => {
    // Eurasia's ring starts inside the Chukotka tip, so accumulating from there leaves all of Europe
    // a full turn west: right on a globe, and drawn into the neighbouring copy of the map.
    expect(recentre(-304.5)).toBe(360);
    expect(recentre(55)).toBe(0);
  });

  it("holds for the real ring that broke this", () => {
    for (const poly of rings()) {
      const lons = unwrap(poly[0]!.slice(0, -1)).ring.map(([lon]) => lon!);
      for (let i = 0; i < lons.length - 1; i += 1) {
        expect(Math.abs(lons[i + 1]! - lons[i]!)).toBeLessThan(180);
      }
    }
  });
});
