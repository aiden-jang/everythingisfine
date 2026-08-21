import { describe, expect, it } from "vitest";
import { FEED_CAP, fetchWildfires, parseWildfires, summarise } from "./wildfires";

const fire = (over: Record<string, unknown> = {}, lon = -52.7, lat = -15.1) => ({
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    eventid: 1030233, eventname: "Forest fires in Brazil", country: "Brazil",
    iscurrent: "true", fromdate: "2026-08-06T00:00:00", todate: "2026-08-20T00:00:00",
    severitydata: { severity: 34160.0, severitytext: "Green impact", severityunit: "ha" },
    ...over,
  },
});

describe("only what is burning now", () => {
  it("keeps the fires flagged current", () => {
    expect(parseWildfires({ features: [fire()] })).toHaveLength(1);
  });

  it("drops the ones that are not, whatever their alert level", () => {
    // The stale ones are exactly the Orange and Red set: 14 complete, and none of them current.
    expect(parseWildfires({ features: [fire({ iscurrent: "false", alertlevel: "Red" })] }))
      .toEqual([]);
  });

  it("reads the flag case-insensitively, since it arrives as a string and not a boolean", () => {
    expect(parseWildfires({ features: [fire({ iscurrent: "True" })] })).toHaveLength(1);
    expect(parseWildfires({ features: [fire({ iscurrent: true })] })).toHaveLength(1);
  });
});

describe("burned area, the one real quantity", () => {
  it("reads the hectares out of severitydata", () => {
    expect(parseWildfires({ features: [fire()] })[0]!.hectares).toBe(34160);
  });

  it("keeps a fire whose severity is missing rather than calling it zero hectares", () => {
    const [f] = parseWildfires({ features: [fire({ severitydata: undefined })] });
    expect(f!.hectares).toBeNull();
  });

  it("totals in square kilometres, which is a unit a reader has a feel for", () => {
    const fires = parseWildfires({ features: [fire(), fire({ eventid: 2 })] });
    expect(summarise(fires).km2).toBe(Math.round(34160 * 2 / 100));
  });

  it("ranks countries by area and not by event count, because the count is truncated", () => {
    /*
     * Angola returns more marks than Australia and Australia is burning harder per fire. Ranking by
     * count would name the country the cap happened to favour.
     */
    const fires = parseWildfires({ features: [
      fire({ country: "Angola", severitydata: { severity: 1000 } }, 18, -12),
      fire({ country: "Angola", eventid: 2, severitydata: { severity: 1000 } }, 19, -12),
      fire({ country: "Australia", eventid: 3, severitydata: { severity: 139348 } }, 135, -19),
    ] });
    expect(summarise(fires).leader).toBe("Australia");
  });
});

describe("how long it has been burning", () => {
  it("is the median span in days, which is the fact no other mark here carries", () => {
    const fires = parseWildfires({ features: [
      fire({ fromdate: "2026-08-17T00:00:00" }),
      fire({ eventid: 2, fromdate: "2026-08-11T00:00:00" }),
      fire({ eventid: 3, fromdate: "2026-08-05T00:00:00" }),
    ] });
    expect(summarise(fires).medianDays).toBe(9);
  });

  it("has no median when nothing carries both dates", () => {
    const fires = parseWildfires({ features: [fire({ fromdate: null })] });
    expect(summarise(fires).medianDays).toBeNull();
  });

  it("summarises an empty set without inventing anything", () => {
    expect(summarise([])).toEqual({ count: 0, km2: 0, medianDays: null, leader: null });
  });
});

describe("what it refuses", () => {
  it("drops a fire with no position rather than putting it in the Gulf of Guinea", () => {
    const broken = { ...fire(), geometry: { coordinates: [null, null] } };
    expect(parseWildfires({ features: [broken] })).toEqual([]);
  });

  it("returns nothing for a payload that is not a feature collection", () => {
    expect(parseWildfires(undefined)).toEqual([]);
  });

  it("gives an empty list rather than throwing into the app", async () => {
    const boom = async (): Promise<Response> => { throw new Error("offline"); };
    await expect(fetchWildfires(boom)).resolves.toEqual([]);
  });

  it("knows where the feed stops, because the legend has to say so", () => {
    // Not cosmetic: a request for Angola alone comes back with a full hundred.
    expect(FEED_CAP).toBe(100);
  });
});
