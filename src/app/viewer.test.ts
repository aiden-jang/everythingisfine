import { describe, expect, it } from "vitest";
import table from "../data/zones.json";
import { viewerPlace, zoneLabel, type ZoneTable } from "./viewer";

const zones = table as ZoneTable;

describe("the timezone table", () => {
  it("carries the zones a browser actually reports", () => {
    // `zone1970.tab` alone omits 106 of these, which is why the generator merges the older file too.
    for (const zone of [
      "Australia/Sydney", "America/New_York", "Europe/London", "Asia/Tokyo",
      "Africa/Nairobi", "Africa/Accra", "America/Argentina/Buenos_Aires", "Asia/Kolkata",
    ]) {
      expect(zones[zone], zone).toBeDefined();
    }
  });

  it("puts them where they actually are", () => {
    // Spot-checked against known coordinates. A sign error in the ISO 6709 parse would show up here as a
    // city in the wrong hemisphere, which is the failure most likely to survive review.
    const [sydLon, sydLat] = zones["Australia/Sydney"]!;
    expect(sydLon).toBeCloseTo(151.2, 0);
    expect(sydLat).toBeCloseTo(-33.9, 0);

    const [nyLon, nyLat] = zones["America/New_York"]!;
    expect(nyLon).toBeCloseTo(-74.0, 0);
    expect(nyLat).toBeCloseTo(40.7, 0);

    const [tkLon, tkLat] = zones["Asia/Tokyo"]!;
    expect(tkLon).toBeCloseTo(139.7, 0);
    expect(tkLat).toBeCloseTo(35.7, 0);
  });

  it("stays inside the coordinate system", () => {
    for (const [zone, at] of Object.entries(zones)) {
      expect(at.length, zone).toBe(2);
      expect(Math.abs(at[0]!), zone).toBeLessThanOrEqual(180);
      expect(Math.abs(at[1]!), zone).toBeLessThanOrEqual(90);
    }
  });
});

describe("naming the place", () => {
  it("takes the last segment, which is the part anybody says", () => {
    expect(zoneLabel("Australia/Sydney")).toBe("Sydney");
    expect(zoneLabel("America/New_York")).toBe("New York");
    // The middle segment is an administrative grouping, not a place.
    expect(zoneLabel("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneLabel("America/Indiana/Indianapolis")).toBe("Indianapolis");
    expect(zoneLabel("Asia/Ho_Chi_Minh")).toBe("Ho Chi Minh");
  });
});

describe("resolving the reader's zone", () => {
  it("finds a real one", () => {
    const at = viewerPlace(zones, "Europe/Lisbon");
    expect(at?.label).toBe("Lisbon");
    expect(at?.lat).toBeCloseTo(38.7, 0);
  });

  it("says nothing rather than guessing", () => {
    /*
     * All three of these happen. A wrong city is worse than no line at all, so each returns null: the
     * sentence is the only thing on screen that claims to be about the reader, and it has one job.
     */
    expect(viewerPlace(zones, undefined)).toBeNull();
    expect(viewerPlace(zones, "Mars/Olympus_Mons")).toBeNull();
    // Not a place. It is what a machine with no configured zone reports.
    expect(viewerPlace(zones, "UTC")).toBeNull();
    expect(viewerPlace(zones, "Etc/UTC")).toBeNull();
    expect(viewerPlace(zones, "")).toBeNull();
  });

  it("refuses a row that is not a coordinate", () => {
    expect(viewerPlace({ "A/B": [] }, "A/B")).toBeNull();
    expect(viewerPlace({ "A/B": [1] }, "A/B")).toBeNull();
    expect(viewerPlace({ "A/B": [Number.NaN, 0] }, "A/B")).toBeNull();
  });
});
