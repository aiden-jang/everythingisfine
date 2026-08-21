import { describe, expect, it } from "vitest";
import { countries, fetchFloods, parseFloods } from "./floods";

const flood = (over: Record<string, unknown> = {}, lon = 100.6, lat = 18.7) => ({
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    eventid: 1104067, eventname: "Flood in Thailand", country: "Thailand",
    iscurrent: "true", fromdate: "2026-07-30T01:00:00", todate: "2026-08-21T01:00:00",
    severitydata: { severity: 0.0, severitytext: "Magnitude 0 ", severityunit: "" },
    ...over,
  },
});

describe("only the floods running now", () => {
  it("keeps the current ones", () => {
    expect(parseFloods({ features: [flood()] })).toHaveLength(1);
  });

  it("drops last year's, which are four fifths of the list", () => {
    /*
     * 81 of the 100 are not current and run to 359 days old. Drawn, the layer would be mostly a flood
     * archive wearing the present tense - the EONET mistake this app already refused once.
     */
    const stale = flood({ iscurrent: "false", todate: "2025-09-01T00:00:00" });
    expect(parseFloods({ features: [stale] })).toEqual([]);
  });

  it("keeps a Red one no differently from a Green one, since neither is rated", () => {
    const both = parseFloods({ features: [
      flood({ alertlevel: "Red" }), flood({ eventid: 2, alertlevel: "Green" }, 19.1, 51.6),
    ] });
    expect(both).toHaveLength(2);
  });
});

describe("the count that is worth stating", () => {
  it("counts distinct countries, which is what a spread this thin has to say", () => {
    const floods = parseFloods({ features: [
      flood({ country: "Peru" }, -76.9, -12.2),
      flood({ country: "Peru", eventid: 2 }, -77.5, -11.0),
      flood({ country: "Poland", eventid: 3 }, 19.1, 51.6),
    ] });
    expect(floods).toHaveLength(3);
    expect(countries(floods)).toBe(2);
  });

  it("does not count a missing country as a country of its own", () => {
    const floods = parseFloods({ features: [flood({ country: null })] });
    expect(countries(floods)).toBe(0);
  });
});

describe("what it refuses", () => {
  it("drops a flood with no readable position", () => {
    const broken = { ...flood(), geometry: {} };
    expect(parseFloods({ features: [broken] })).toEqual([]);
  });

  it("gives an empty list rather than throwing into the app", async () => {
    const bad = async (): Promise<Response> => new Response("", { status: 503 });
    await expect(fetchFloods(bad)).resolves.toEqual([]);
  });
});
