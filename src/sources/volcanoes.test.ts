import { describe, expect, it } from "vitest";
import { fetchVolcanoes, newestEpisode, parseVolcanoes } from "./volcanoes";

const feature = (over: Record<string, unknown> = {}, lon = 15.0, lat = 37.7) => ({
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    eventid: 1000142,
    eventname: "Etna",
    country: "Italy",
    alertlevel: "Green",
    todate: "2026-08-11T21:25:00",
    fromdate: "2026-07-06T04:00:00",
    severitydata: { severity: 0.0, severitytext: "", severityunit: null },
    ...over,
  },
});

describe("one triangle per volcano, not per episode", () => {
  it("collapses repeated episodes of the same mountain", () => {
    /*
     * The live list carries Mayon three times and Kanlaon four, one per episode. Drawn as published that
     * is four marks on one mountain, which reads as four volcanoes rather than one with a history.
     */
    const list = parseVolcanoes({
      features: [
        feature({ eventname: "Mayon", todate: "2026-07-15T00:00:00" }, 123.7, 13.3),
        feature({ eventname: "Mayon", todate: "2026-05-03T00:00:00" }, 123.7, 13.3),
        feature({ eventname: "Mayon", todate: "2026-02-11T00:00:00" }, 123.7, 13.3),
        feature(),
      ],
    });
    expect(list).toHaveLength(2);
    expect(list.map((v) => v.name).sort()).toEqual(["Etna", "Mayon"]);
  });

  it("keeps two volcanoes that merely share a name", () => {
    // Position is part of the identity, so a name collision between two mountains is not a merge.
    const list = parseVolcanoes({
      features: [feature({ eventname: "Ambae" }, 167.8, -15.4), feature({ eventname: "Ambae" }, 100.0, 0.0)],
    });
    expect(list).toHaveLength(2);
  });
});

describe("reading the dates as what they are", () => {
  it("treats a zoneless GDACS stamp as UTC, not as the viewer's clock", () => {
    /*
     * "2026-08-11T21:25:00" has no zone, and the platform reads that as local time. Left alone, every
     * volcano moves by the viewer's offset and a New Zealand eruption lands half a day out.
     */
    const [v] = parseVolcanoes({ features: [feature()] });
    expect(v!.endedAt).toBe(Date.parse("2026-08-11T21:25:00Z"));
  });

  it("respects a stamp that does carry a zone", () => {
    const [v] = parseVolcanoes({ features: [feature({ todate: "2026-08-11T21:25:00Z" })] });
    expect(v!.endedAt).toBe(Date.parse("2026-08-11T21:25:00Z"));
  });

  it("falls back to the start when there is no end", () => {
    const [v] = parseVolcanoes({ features: [feature({ todate: null })] });
    expect(v!.endedAt).toBe(Date.parse("2026-07-06T04:00:00Z"));
  });

  it("keeps a volcano with no usable date at all, because it is still a volcano", () => {
    const [v] = parseVolcanoes({ features: [feature({ todate: null, fromdate: "nonsense" })] });
    expect(v!.endedAt).toBeNull();
    expect(v!.name).toBe("Etna");
  });

  it("finds the newest episode for a legend that must state its own span", () => {
    const list = parseVolcanoes({
      features: [
        feature({ eventname: "Old", todate: "2024-01-01T00:00:00" }, 1, 1),
        feature({ eventname: "New", todate: "2026-08-11T00:00:00" }, 2, 2),
        feature({ eventname: "Undated", todate: null, fromdate: "x" }, 3, 3),
      ],
    });
    expect(newestEpisode(list)).toBe(Date.parse("2026-08-11T00:00:00Z"));
  });

  it("has no newest when nothing is dated", () => {
    expect(newestEpisode([])).toBeNull();
  });
});

describe("what it refuses", () => {
  it("drops a feature with no usable position rather than placing it at zero", () => {
    const broken = { ...feature(), geometry: { coordinates: ["x", 1] } };
    expect(parseVolcanoes({ features: [broken] })).toEqual([]);
  });

  it("returns nothing for a payload that is not a feature collection", () => {
    expect(parseVolcanoes(null)).toEqual([]);
    expect(parseVolcanoes({ features: "no" })).toEqual([]);
  });

  it("gives an empty list rather than throwing into the app", async () => {
    const boom = async (): Promise<Response> => {
      throw new Error("offline");
    };
    await expect(fetchVolcanoes(boom)).resolves.toEqual([]);
    const bad = async (): Promise<Response> => new Response("", { status: 500 });
    await expect(fetchVolcanoes(bad)).resolves.toEqual([]);
  });
});
