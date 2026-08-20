import { describe, expect, it } from "vitest";
import { resolvable } from "./disagree";
import { cellSizeDeg, CLUSTER_UNTIL } from "./cluster";

/*
 * Two agencies place one earthquake tens of kilometres apart, and until now the map drew one marker
 * and said nothing about it. The rule below is the whole design decision: a tie line is drawn exactly
 * when the map is capable of showing its two ends as two places.
 */

describe("whether a disagreement can be seen", () => {
  it("draws nothing when both readings collapse into one marker", () => {
    /*
     * The case that matters. Zoomed out, two readings 30km apart fall in one clustering cell and the
     * map draws a single dot for them, so a line between them would be shorter than the dot it sits
     * under: a mark asserting a distinction the picture is not making.
     */
    const cell = cellSizeDeg(1);
    expect(cell).toBeGreaterThan(0);
    expect(resolvable(122.0, -6.0, 122.2, -6.1, cell)).toBe(false);
  });

  it("draws once the two ends land in different cells", () => {
    const cell = cellSizeDeg(1);
    // Far enough apart at this zoom that the map is already drawing two separate markers.
    expect(resolvable(122.0, -6.0, 130.0, -6.0, cell)).toBe(true);
  });

  it("draws every pair once clustering is off", () => {
    /*
     * Above the clustering threshold the cell size is zero, every event stands alone, and there is no
     * such thing as an unresolvable pair. Guarded explicitly because a zero cell in the key arithmetic
     * would be a division by zero rather than "no clustering".
     */
    const cell = cellSizeDeg(CLUSTER_UNTIL);
    expect(cell).toBe(0);
    // A separation far below anything visible at low zoom, which at this zoom is real screen distance.
    expect(resolvable(122.0, -6.0, 122.02, -6.01, cell)).toBe(true);
  });

  it("resolves more pairs as the view tightens, and never fewer", () => {
    /*
     * The property rather than a point: the same disagreement becomes visible as you zoom in, and a
     * rule that flickered the other way would make ties appear and vanish while somebody zoomed.
     */
    const a = { lon: 122.0, lat: -6.0 };
    const b = { lon: 124.6, lat: -6.0 };
    let seen = false;
    for (const zoom of [0.75, 1, 1.3, 1.6, CLUSTER_UNTIL, 2.5]) {
      const now = resolvable(a.lon, a.lat, b.lon, b.lat, cellSizeDeg(zoom));
      // Once true it must stay true as the cell shrinks.
      if (seen) expect(now).toBe(true);
      seen = seen || now;
    }
    expect(seen).toBe(true);
  });

  it("is symmetric, since a tie has no direction", () => {
    const cell = cellSizeDeg(1);
    expect(resolvable(122, -6, 130, -6, cell)).toBe(resolvable(130, -6, 122, -6, cell));
    expect(resolvable(122, -6, 122.1, -6, cell)).toBe(resolvable(122.1, -6, 122, -6, cell));
  });

  it("does not stop resolving at high latitude, where cells widen", () => {
    /*
     * Longitude cells widen by 1/cos(lat), which is the fix that stopped the far north clustering
     * differently from the equator. A pair that resolves at the equator has to resolve at the same
     * ground separation in the Aleutians, not a wider one.
     */
    const cell = cellSizeDeg(1.5);
    const equator = resolvable(0, 0, 6, 0, cell);
    const north = resolvable(-155, 57, -155 + 6 / Math.cos((57 * Math.PI) / 180), 57, cell);
    expect(equator).toBe(true);
    expect(north).toBe(true);
  });
});
