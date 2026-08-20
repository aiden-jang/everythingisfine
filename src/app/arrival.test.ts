import { describe, expect, it } from "vitest";
import { arrivalFor, between, MAX_KM, parsePlace, pathKm, seconds } from "./arrival";
import { distanceLabel } from "./format";
import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import type { Quake, Reading } from "../data/types";

/*
 * Every number here is the agency's own or derived from it. The point of the design is that nothing is
 * authored, so nothing can be quietly wrong about a real town.
 */

const reading = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs", id: "a1", magnitude: 4.2, scale: "ml", lon: 141.3, lat: 41.8, depthKm: 10,
  time: 1_700_000_000_000, place: "40 km E of Hakodate, Japan", kind: "earthquake",
  receivedAt: 1_700_000_020_000, ...over,
});

const quake = (readings: Reading[]): Quake => ({
  key: "k", readings, primary: readings[0]!,
});

describe("reading a distance out of an agency's own words", () => {
  it("takes the real USGS shapes", () => {
    expect(parsePlace("38 km NW of Stanton, Texas")).toEqual({ km: 38, name: "Stanton, Texas" });
    expect(parsePlace("7 km SE of Julian, CA")).toEqual({ km: 7, name: "Julian, CA" });
    expect(parsePlace("13 km NNW of Gustavus, Alaska"))
      .toEqual({ km: 13, name: "Gustavus, Alaska" });
  });

  it("takes a decimal distance, which the feed sometimes publishes", () => {
    expect(parsePlace("2.5 km W of Volcano, Hawaii")?.km).toBe(2.5);
  });

  it("refuses a region, because a region has no distance to give", () => {
    /*
     * EMSC writes Flynn regions and USGS writes some of its own. Both name an area. Inventing a
     * distance from a region's centroid would be the authored-coordinate mistake this design exists
     * to avoid, so they parse to nothing and are skipped.
     */
    expect(parsePlace("OFF EAST COAST OF KAMCHATKA")).toBeNull();
    expect(parsePlace("Flores Sea")).toBeNull();
    expect(parsePlace("South Sandwich Islands region")).toBeNull();
    expect(parsePlace("")).toBeNull();
  });

  it("refuses a zero or nonsense distance rather than dividing by it", () => {
    expect(parsePlace("0 km N of Somewhere")).toBeNull();
  });
});

describe("the path the wave actually travels", () => {
  it("is the hypotenuse, not the distance on the map", () => {
    // 40km across the surface from a 45km-deep rupture is 60km of rock, not 40.
    expect(pathKm(40, 45)).toBeCloseTo(60.21, 2);
    expect(pathKm(3, 4)).toBe(5);
  });

  it("matters most exactly where depth does", () => {
    // A third longer for a deep event, and unchanged for a surface one.
    expect(pathKm(40, 45) / 40).toBeGreaterThan(1.5);
    expect(pathKm(40, 0)).toBe(40);
  });

  it("treats a missing depth as the surface, following the marker's own decision", () => {
    expect(pathKm(40, Number.NaN)).toBe(40);
  });

  it("ignores a negative depth rather than shortening the path with it", () => {
    expect(pathKm(40, -20)).toBe(40);
  });
});

describe("the arrival", () => {
  it("times both waves over the path at crustal speeds", () => {
    const a = arrivalFor(quake([reading({ depthKm: 45 })]))!;
    const path = pathKm(40, 45);
    expect(a.place).toBe("Hakodate, Japan");
    expect(a.km).toBe(40);
    expect(a.p).toBeCloseTo(path / P_WAVE_KM_PER_S, 9);
    expect(a.gap).toBeCloseTo(path / S_WAVE_KM_PER_S - path / P_WAVE_KM_PER_S, 9);
  });

  it("puts the S wave after the P, never before", () => {
    for (const depthKm of [0, 10, 70, 300]) {
      expect(arrivalFor(quake([reading({ depthKm })]))!.gap).toBeGreaterThan(0);
    }
  });

  it("lands on human numbers, which is the reason the item is worth building", () => {
    // 40km away and 45km deep is 60.2km of path: P at 10.0s, S at 17.2s, so seven seconds between.
    const a = arrivalFor(quake([reading({ depthKm: 45 })]))!;
    expect(seconds(a.p)).toBe("10 seconds");
    expect(seconds(a.gap)).toBe("7 seconds");
  });

  it("falls back to the other agency's words when the primary names only a region", () => {
    // The marker may be drawn from EMSC while USGS is the one that named a town and a distance.
    const emsc = reading({ source: "emsc", id: "e1", place: "FLORES SEA" });
    const usgs = reading({ source: "usgs", id: "u1", place: "22 km SW of Maumere, Indonesia" });
    expect(arrivalFor({ key: "k", readings: [emsc, usgs], primary: emsc })!.place)
      .toBe("Maumere, Indonesia");
  });

  it("prefers the primary, so the distance and the position are one agency's account", () => {
    const usgs = reading({ source: "usgs", id: "u1", place: "40 km E of Hakodate, Japan" });
    const emsc = reading({ source: "emsc", id: "e1", place: "9 km N of Somewhere Else" });
    expect(arrivalFor({ key: "k", readings: [usgs, emsc], primary: usgs })!.place)
      .toBe("Hakodate, Japan");
  });

  it("says nothing when no agency gave a distance", () => {
    expect(arrivalFor(quake([reading({ place: "Flores Sea" })]))).toBeNull();
  });

  it("refuses a teleseismic distance rather than approximating one", () => {
    /*
     * Past the cap the wave dives into faster mantle and arrives before a constant velocity would say,
     * so the number would read as measured and be wrong.
     */
    expect(arrivalFor(quake([reading({ place: `${MAX_KM + 1} km N of Nowhere` })]))).toBeNull();
    expect(arrivalFor(quake([reading({ place: `${MAX_KM - 1} km N of Nowhere` })]))).not.toBeNull();
  });
});

describe("stating a duration no more precisely than it is known", () => {
  it("uses whole seconds, since a kilometre of rounding is already a sixth of one", () => {
    expect(seconds(9.6)).toBe("10 seconds");
    expect(seconds(1.4)).toBe("1 second");
  });

  it("says under a second rather than zero, which is a different claim", () => {
    expect(seconds(0.4)).toBe("under a second");
  });

  it("switches to minutes before the seconds become unreadable", () => {
    expect(seconds(200)).toBe("3 minutes");
  });

  it("refuses a nonsense input rather than printing NaN at somebody", () => {
    expect(seconds(Number.NaN)).toBe("unknown");
    expect(seconds(-5)).toBe("unknown");
  });
});

describe("measuring between two events", () => {
  it("gives the great-circle distance, whatever the separation", () => {
    // A quarter of the way round: distance is geometry and is true at any separation.
    const quarter = between(0, 0, 90, 0);
    expect(quarter.km).toBeCloseTo((Math.PI / 2) * 6371, 0);
  });

  it("times a P wave across a regional distance", () => {
    const near = between(0, 0, 0, 3);
    expect(near.km).toBeCloseTo(333.6, 1);
    expect(near.p!).toBeCloseTo(near.km / P_WAVE_KM_PER_S, 9);
  });

  it("refuses a time past the distance a constant velocity can describe", () => {
    /*
     * The same cap and the same reason as the arrival sentence: further out the wave dives into faster
     * mantle and a constant would read as measured while being wrong. Distance survives, time does not.
     */
    const far = between(0, 0, 90, 0);
    expect(far.km).toBeGreaterThan(MAX_KM);
    expect(far.p).toBeNull();
  });

  it("is symmetric, since a separation has no direction", () => {
    const there = between(141, 41, 122, -6);
    const back = between(122, -6, 141, 41);
    expect(there.km).toBeCloseTo(back.km, 9);
  });

  it("is zero for one event against itself", () => {
    const same = between(141.3, 41.8, 141.3, 41.8);
    expect(same.km).toBeCloseTo(0, 9);
    expect(same.p!).toBeCloseTo(0, 9);
  });

  it("crosses the antimeridian the short way", () => {
    // 2 degrees apart, not 358. A haversine handles it, and this is the assertion that says so.
    expect(between(179, 0, -179, 0).km).toBeCloseTo(222.4, 1);
  });

  it("reads out in whole kilometres, and metres when two epicentres nearly coincide", () => {
    expect(distanceLabel(412.4)).toBe("412 km");
    expect(distanceLabel(1834)).toBe("1,834 km");
    expect(distanceLabel(0.4)).toBe("400 m");
    expect(distanceLabel(Number.NaN)).toBe("unknown");
  });
});
