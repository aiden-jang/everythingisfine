import { describe, expect, it } from "vitest";
import { KM_PER_DEGREE, kmPerPixel, latitudeLabel, niceScale } from "./scale";
import { distanceLabel } from "../app/format";

/*
 * The scale bar, whose only interesting property is that it refuses to be one number.
 */

describe("kilometres per pixel", () => {
  it("is the latitude scale at the equator, where the two agree", () => {
    // One degree per pixel at the equator is one degree of latitude per pixel, by definition.
    expect(kmPerPixel(1, 0)).toBeCloseTo(KM_PER_DEGREE, 6);
  });

  it("halves by sixty degrees, which is why the bar cannot be one number", () => {
    // cos(60) is exactly a half, so the same pixels cover half the ground at sixty degrees as at the equator.
    // A bar labelled once and drawn everywhere is wrong by a factor of two here and eleven at the limit.
    expect(kmPerPixel(1, 60)).toBeCloseTo(KM_PER_DEGREE / 2, 6);
    expect(kmPerPixel(1, -60)).toBeCloseTo(KM_PER_DEGREE / 2, 6);
  });

  it("collapses toward the pole rather than going negative", () => {
    expect(kmPerPixel(1, 85)).toBeGreaterThan(0);
    expect(kmPerPixel(1, 85)).toBeLessThan(kmPerPixel(1, 60));
  });
});

describe("choosing the bar", () => {
  it("picks a round number a reader can halve by eye", () => {
    // 110px at 4.5 km/px wants 495km, and 500 is the round number next to it.
    expect(niceScale(4.5, 110)!.km).toBe(500);
  });

  it("chooses in log space, so 300 does not always round up", () => {
    // 300 is 1.67 times 200 and 0.6 times 500. Linear distance calls 500 nearer; proportionally 200 is the
    // closer of the two, and proportion is what a ruler is read in.
    expect(niceScale(3, 100)!.km).toBe(200);
  });

  it("returns a length that is the labelled distance, not the target", () => {
    const bar = niceScale(4.5, 110)!;
    expect(bar.px).toBeCloseTo(500 / 4.5, 6);
    // Near the target it was asked for, but never pinned to it: the number is round, not the width.
    expect(Math.abs(bar.px - 110)).toBeLessThan(40);
  });

  it("has nothing to draw when there is no scale", () => {
    expect(niceScale(0, 110)).toBeNull();
    expect(niceScale(Number.NaN, 110)).toBeNull();
    // A pole-on view collapses `cos` to zero, and a bar of no length is not a bar.
    expect(niceScale(kmPerPixel(1, 90), 110)).toBeNull();
  });

  it("draws nothing rather than nonsense when the view is outside the table", () => {
    // Both ends. Clamping to the nearest step instead would draw a bar a million pixels long and
    // label it 1 km, which is worse than an absent scale in every way.
    expect(niceScale(0.000001, 110)).toBeNull();
    expect(niceScale(1e6, 110)).toBeNull();
  });

  it("still covers the whole range this camera can reach", () => {
    // The map runs from roughly a thousand kilometres a bar at its tightest zoom down to about a hundred at 85
    // degrees. The guard above must not be tight enough to bite anywhere in there.
    for (const kmPerPx of [0.9, 1.2, 4.5, 13.5, 40, 90]) {
      expect(niceScale(kmPerPx, 110)).not.toBeNull();
    }
  });
});

describe("labels", () => {
  it("thousands-separates, because 10000 km is a number nobody reads at a glance", () => {
    expect(distanceLabel(10_000)).toBe("10,000 km");
    expect(distanceLabel(500)).toBe("500 km");
  });

  it("drops to metres below a kilometre", () => {
    expect(distanceLabel(0.5)).toBe("500 m");
  });

  it("names the hemisphere, and neither of them at the equator", () => {
    expect(latitudeLabel(38.4)).toBe("38°N");
    expect(latitudeLabel(-12.7)).toBe("13°S");
    expect(latitudeLabel(0)).toBe("0°");
    // Rounding to zero from either side is still the equator, not a hemisphere.
    expect(latitudeLabel(0.2)).toBe("0°");
    expect(latitudeLabel(-0.2)).toBe("0°");
  });
});
