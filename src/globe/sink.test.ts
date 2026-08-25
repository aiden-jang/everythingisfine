import { describe, expect, it } from "vitest";
import { sinkFraction } from "./events";
import { EARTH_RADIUS_KM } from "../geo/sphere";

describe("how far below the surface a marker is drawn", () => {
  it("is a fraction of the globe's radius, not of a depth band", () => {
    // The point of the second attribute: aDepth clamps at 300km, and these do not.
    expect(sinkFraction(300)).toBeCloseTo(300 / EARTH_RADIUS_KM, 6);
    expect(sinkFraction(700)).toBeCloseTo(700 / EARTH_RADIUS_KM, 6);
    // A 700km event sits more than twice as deep as a 300km one, which is the whole reason it exists.
    expect(sinkFraction(700) / sinkFraction(300)).toBeCloseTo(700 / 300, 6);
  });

  it("leaves a surface event on the surface", () => {
    expect(sinkFraction(0)).toBe(0);
    // Depth is optional in both feeds and arrives as NaN. Sinking by NaN moves every vertex to
    // nowhere and takes the whole draw call with it, so this is the one that matters.
    expect(sinkFraction(Number.NaN)).toBe(0);
    // Negative depths appear in real catalogues for events above sea level.
    expect(sinkFraction(-3)).toBe(0);
  });

  it("treats a depth outside the planet as no reading at all", () => {
    // One rule for every bad value. Clamping an absurd depth to the centre while letting Infinity
    // through to the surface put two flavours of the same nonsense 6371km apart.
    expect(sinkFraction(99_999)).toBe(0);
    expect(sinkFraction(Number.POSITIVE_INFINITY)).toBe(0);
    // The deepest earthquake ever recorded is about 750km, so the boundary is nowhere near real data.
    expect(sinkFraction(EARTH_RADIUS_KM)).toBeCloseTo(1, 6);
  });
});
