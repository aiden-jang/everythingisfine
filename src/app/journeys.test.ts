import { describe, expect, it } from "vitest";
import { createStore } from "../data/store";
import type { Filters, Reading } from "../data/types";
import type { RegionCount } from "./regions";
import { journeyFor, observatorySummary, observatoryFeedNote } from "./journeys";
import { initialPresentation } from "./useObservatory";
import { tourArrivedAt } from "./tour";

const NOW = 1_700_000_000_000;
const filters: Filters = { minMagnitude: 2, windowMs: 86_400_000, sources: new Set(["usgs", "emsc"]) };
const reading = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs",
  id: "base",
  magnitude: 3.2,
  scale: "mb",
  lon: 140,
  lat: 35,
  depthKm: 10,
  time: NOW - 1000,
  place: "Test place",
  kind: "earthquake",
  receivedAt: NOW,
  ...over,
});
const region = (name: string, count: number): RegionCount => ({
  region: {
    name,
    count: 0,
    lon: 130,
    lat: 30,
    zoom: 1.4,
    bounds: [120, 20, 140, 40],
  } as RegionCount["region"],
  count,
});

describe("discoveries derived from the current view", () => {
  it("captures the largest reading, a distinct deep event, a busy region and an overview", () => {
    const store = createStore();
    store.ingest(reading({ id: "largest", magnitude: 5.6, scale: "Mww", place: "Largest place" }));
    store.ingest(reading({ id: "deep", lon: -175, lat: -20, depthKm: 520, place: "Deep place" }));
    const journey = journeyFor(store, filters, NOW, [region("Quiet", 0), region("Active", 2)]);
    expect(journey.stops.map((stop) => stop.purpose)).toEqual(["largest", "depth", "region", "overview"]);
    expect(journey.stops[0]).toMatchObject({
      lon: 140,
      lat: 35,
      reading: { id: "largest", scale: "Mww", magnitude: 5.6 },
    });
    expect(journey.stops[0]!.description).toContain("Mww 5.6");
    expect(journey.stops[1]).toMatchObject({ reading: { id: "deep" }, lon: -175, lat: -20 });
    expect(journey.stops[1]!.description).toContain("520 km");
    expect(journey.deepest?.depthKm).toBe(520);
    expect(journey.stops.at(-1)!.count).toBe(2);
  });

  it("honors source, magnitude, time window and a held cursor without inventing extra stops", () => {
    const store = createStore();
    store.ingest(reading({ id: "visible", time: NOW - 3000, depthKm: Number.NaN }));
    store.ingest(reading({ source: "emsc", id: "other", magnitude: 8, lon: -80, depthKm: 600 }));
    store.ingest(reading({ id: "old", time: NOW - 2 * 86_400_000, magnitude: 9 }));
    store.ingest(reading({ id: "small", magnitude: 1, depthKm: 600 }));
    store.ingest(reading({ id: "future-to-cursor", time: NOW - 500, magnitude: 7, depthKm: 500 }));
    const journey = journeyFor(store, { ...filters, sources: new Set(["usgs"]) }, NOW, [], NOW - 2000);
    expect(journey.stops.map((stop) => stop.purpose)).toEqual(["largest", "overview"]);
    expect(journey.stops[0]!.reading?.id).toBe("visible");
    expect(journey.deepest).toBeNull();
    expect(journey.stops.at(-1)!.count).toBe(1);
  });

  it("does not fly twice to the same largest and deepest event or tour an empty view", () => {
    const store = createStore();
    expect(journeyFor(store, filters, NOW, [region("Empty", 0)]).stops).toEqual([]);
    store.ingest(reading({ depthKm: 600 }));
    expect(journeyFor(store, filters, NOW, []).stops.map((stop) => stop.purpose)).toEqual([
      "largest",
      "overview",
    ]);
    expect(journeyFor(store, { ...filters, sources: new Set() }, NOW, []).stops).toEqual([]);
  });

  it("keeps named-region ties stable and original polar coordinates intact", () => {
    const store = createStore();
    store.ingest(reading({ lat: 89, depthKm: 90 }));
    const journey = journeyFor(store, filters, NOW, [region("Bravo", 1), region("Alpha", 1)]);
    expect(journey.stops[0]!.lat).toBe(89);
    expect(journey.stops.find((stop) => stop.purpose === "region")!.name).toBe("Alpha");
    expect(tourArrivedAt({ lon: 140, lat: 85, zoom: 1.5 }, journey.stops[0]!)).toBe(true);
    expect(tourArrivedAt({ lon: 140, lat: 85, zoom: 1 }, journey.stops[0]!)).toBe(false);
    expect(tourArrivedAt({ lon: 179, lat: 0, zoom: 1 }, { lon: -179, lat: 0, zoom: 1 })).toBe(true);
  });
});

describe("the observatory entry", () => {
  const read =
    (values: Record<string, string> = {}) =>
    (key: string): string | null =>
      values[key] ?? null;
  it("opens a fresh visit without saving defaults", () => {
    expect(initialPresentation({}, read())).toBe("observe");
  });
  it("retains explicit layout preferences and lets a saved presentation win", () => {
    expect(initialPresentation({}, read({ railOpen: "0" }))).toBe("explore");
    expect(initialPresentation({}, read({ flat: "1" }))).toBe("explore");
    expect(initialPresentation({}, read({ presentation: "observe", flat: "1" }))).toBe("observe");
    expect(initialPresentation({}, read({ presentation: "invalid" }))).toBe("observe");
  });
  it("opens linked content directly in the explorer without a welcome screen in front of it", () => {
    for (const shared of [
      { event: "usgs:event" },
      { day: "2011-03-11" },
      { mark: "cyclone:1" },
      { cursor: NOW },
    ]) {
      expect(initialPresentation(shared, read({ presentation: "observe" }))).toBe("explore");
    }
  });
});

describe("honest observatory summaries", () => {
  it("labels the magnitude, selected time window and single source", () => {
    const filters = { minMagnitude: 4.5, windowMs: 86_400_000, sources: new Set(["usgs"] as const) };
    expect(observatorySummary(1234, filters, { label: "last 24 hours", partial: false }, null)).toBe(
      "1,234 earthquakes · M4.5+ · last 24 hours · USGS only",
    );
    expect(
      observatorySummary(0, filters, { label: "Partial source coverage", partial: true }, "2011-03-11"),
    ).toBe(
      "0 earthquakes in available reports · M4.5+ · 2011-03-11 archive · Partial source coverage · USGS only",
    );
    expect(
      observatorySummary(0, { ...filters, sources: new Set() }, { label: "", partial: false }, null),
    ).toContain("No earthquake sources selected");
  });
  it("distinguishes unavailable earthquake feeds from other feed failures", () => {
    const live = { kind: "live", since: NOW } as const;
    const failed = { kind: "failing", reason: "Offline", retryAt: NOW + 10000 } as const;
    expect(observatoryFeedNote({ usgs: live, emsc: live }, null)).toBeNull();
    expect(observatoryFeedNote({ usgs: failed, emsc: live }, null)).toContain("USGS is not answering");
    expect(observatoryFeedNote({ usgs: failed, emsc: failed }, "Aurora is unavailable.")).toContain(
      "USGS and EMSC are not answering",
    );
    expect(observatoryFeedNote({ usgs: live, emsc: live }, "Aurora is unavailable.")).toBe(
      "Aurora is unavailable.",
    );
  });
  it("does not offer an impossible depth as an Earth cutaway", () => {
    const store = createStore();
    store.ingest(reading({ depthKm: 7000 }));
    expect(journeyFor(store, filters, NOW, []).deepest).toBeNull();
  });
});
