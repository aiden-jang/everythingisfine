import { describe, expect, it } from "vitest";
import {
  APPROACH_MS,
  FIXES,
  FLIGHT_MS,
  LANDFALL,
  START,
  TRACK_MINUTES,
  stormAt,
  stormCategory,
  stormFrame,
} from "./stormTrack";

describe("the HURDAT2 Katrina replay", () => {
  it("retains the source peak and the exact Buras landfall", () => {
    expect(FIXES.map(({ wind }) => wind)).toEqual([100, 125, 145, 150, 140, 125, 110]);
    expect(stormAt(18 * 60).fix).toMatchObject({ at: "2005-08-28T18:00:00Z", pressure: 902 });
    expect(stormCategory(150)).toBe(5);
    expect(LANDFALL).toMatchObject({
      at: "2005-08-29T11:10:00Z",
      lat: 29.3,
      lon: -89.6,
      wind: 110,
      pressure: 920,
      r34: null,
      r64: null,
      landfall: true,
    });
    expect(stormCategory(LANDFALL.wind)).toBe(3);
    expect(stormAt(TRACK_MINUTES).fix).toBe(LANDFALL);
  });

  it("interpolates the center and available radii without inventing a wind reading", () => {
    const middle = stormAt(180);
    expect(middle.lon).toBeCloseTo(-86.3);
    expect(middle.lat).toBeCloseTo(25);
    expect(middle.fix.wind).toBe(100);
    expect(middle.r34).toEqual([150, 130, 112.5, 140]);
    expect(stormAt(TRACK_MINUTES).r64).toBeNull();
  });

  it("frames the scene without moving the clock and settles to the static map", () => {
    expect(stormFrame(0, false).storm.at).toBe(START);
    expect(stormFrame(APPROACH_MS, false).storm.at).toBe(START);
    expect(stormFrame(0, false).camera.pitch).toBeGreaterThan(stormFrame(APPROACH_MS, false).camera.pitch);
    expect(stormFrame(FLIGHT_MS, false).storm.fix).toBe(LANDFALL);
    expect(stormFrame(FLIGHT_MS, false).camera).toEqual(stormFrame(0, true).camera);
  });
});
