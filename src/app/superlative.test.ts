import { describe, expect, it } from "vitest";
import table from "./regionMax.json";
import { REGIONS } from "./regions";
import { recordWhen, regionOf, SINCE, superlativeFor } from "./superlative";
import type { Quake } from "../data/types";

const quake = (lon: number, lat: number, magnitude: number): Quake => ({
  key: "k", readings: [], primary: { lon, lat, magnitude },
} as unknown as Quake);

describe("the generated records", () => {
  it("covers every region the rail counts by", () => {
    // A region with counts in the rail and no record here is a sentence with a hole in it.
    for (const region of REGIONS) {
      expect(Object.keys(table), region.name).toContain(region.name);
    }
  });

  it("holds magnitudes and days that are actually possible", () => {
    for (const [name, entry] of Object.entries(table as unknown as Record<string, [number, string]>)) {
      const [mag, day] = entry;
      // Above the generator's own threshold, and below the largest ever instrumentally recorded.
      expect(mag, name).toBeGreaterThanOrEqual(6);
      expect(mag, name).toBeLessThanOrEqual(9.5);
      expect(day, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.slice(0, 4) >= SINCE, name).toBe(true);
    }
  });

  it("agrees with the events the app already names elsewhere", () => {
    // Cross-checked against `notableDays.ts`, which was written independently of this table.
    const records = table as unknown as Record<string, [number, string]>;
    expect(records["Japan & Kurils"]).toEqual([9.1, "2011-03-11"]);
    expect(records["Indonesia"]).toEqual([9.1, "2004-12-26"]);
    expect(records["Chile & Peru"]).toEqual([8.8, "2010-02-27"]);
  });
});

describe("placing an event", () => {
  it("finds the region a coordinate is in", () => {
    expect(regionOf(142, 38)).toBe("Japan & Kurils");
    expect(regionOf(-120, 36)).toBe("California");
  });

  it("says nothing mid-ocean, where there is no local record to mean anything", () => {
    // The middle of the Pacific is in none of the boxes, and inventing a comparison there would be
    // comparing an event to a region it is not in.
    expect(regionOf(-140, 0)).toBeNull();
  });
});

describe("comparing against the region's ceiling", () => {
  it("reports the ceiling for an ordinary event", () => {
    const s = superlativeFor(quake(142, 38, 4.9))!;
    expect(s.region).toBe("Japan & Kurils");
    expect(s.record).toBe(9.1);
    expect(s.beaten).toBe(false);
  });

  it("flags the rare case where the ceiling has been cleared", () => {
    // The one sentence worth having: a strict comparison, so equalling the record is not beating it.
    expect(superlativeFor(quake(142, 38, 9.2))!.beaten).toBe(true);
    expect(superlativeFor(quake(142, 38, 9.1))!.beaten).toBe(false);
  });

  it("says nothing when there is nothing to say", () => {
    expect(superlativeFor(null)).toBeNull();
    expect(superlativeFor(quake(-140, 0, 7))).toBeNull();
    expect(superlativeFor(quake(142, 38, Number.NaN))).toBeNull();
  });
});

describe("naming when the record happened", () => {
  it("gives the month, not the day", () => {
    expect(recordWhen("2011-03-11")).toBe("March 2011");
    expect(recordWhen("2004-12-26")).toBe("December 2004");
  });

  it("passes a malformed day through rather than inventing a date", () => {
    expect(recordWhen("not-a-day")).toBe("not-a-day");
  });
});
