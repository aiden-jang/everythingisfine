import { describe, expect, it } from "vitest";
import { createStore } from "../data/store";
import type { Filters, Reading } from "../data/types";
import { fold, PLACE_LIMIT, search } from "./search";

/* Search over the only two things this app can honestly search: the authored regions, and the place strings
   the agencies wrote on the events currently held. See ARCHITECTURE.md#srcappsearchtestts. */

const now = 1_700_000_000_000;

const reading = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs",
  id: "a1",
  magnitude: 4.0,
  scale: "Mww",
  lon: 141.3,
  lat: 41.8,
  depthKm: 40,
  time: now - 60_000,
  place: "40 km E of Hakodate, Japan",
  kind: "earthquake",
  receivedAt: now - 30_000,
  ...over,
});

const filters: Filters = {
  minMagnitude: 0,
  windowMs: 24 * 3_600_000,
  sources: new Set(["usgs", "emsc"]),
};

const withEvents = (readings: Reading[]) => {
  const store = createStore(1000);
  readings.forEach((r) => store.ingest(r));
  return store;
};

describe("folding, because no two agencies write a place the same way", () => {
  it("flattens case, accents and punctuation to one comparable form", () => {
    expect(fold("OFF EAST COAST OF KAMCHATKA")).toBe("off east coast of kamchatka");
    expect(fold("Coquimbo, Chile")).toBe("coquimbo chile");
    expect(fold("72 km E of Petropavlovsk-Kamchatsky")).toBe("72 km e of petropavlovsk kamchatsky");
  });

  it("strips accents, since a keyboard that types Coquimbo may not type Coquimbó", () => {
    expect(fold("Coquimbó")).toBe("coquimbo");
    expect(fold("Türkiye")).toBe("turkiye");
  });
});

describe("what a query finds", () => {
  it("finds an authored region by name", () => {
    const r = search("japan", withEvents([]), filters, now);
    expect(r.hits.map((h) => (h.kind === "region" ? h.region.name : h.name))).toContain("Japan & Kurils");
  });

  it("offers a region even with nothing in it, because it is still somewhere to go", () => {
    /*
     * The distinction the whole feature rests on. A region is authored navigation and exists whether
     * or not the planet has obliged; a place only exists here while an event is in the buffer.
     */
    const r = search("kamchatka", withEvents([]), filters, now);
    const region = r.hits.find((h) => h.kind === "region");
    expect(region).toBeDefined();
    expect(region!.kind === "region" && region!.count).toBe(0);
  });

  it("finds a place from what an agency wrote on an event", () => {
    const store = withEvents([reading({ id: "x", place: "Flores Sea", lon: 122, lat: -6 })]);
    const r = search("flores", store, filters, now);
    expect(r.hits.some((h) => h.kind === "place" && h.name === "Flores Sea")).toBe(true);
  });

  it("merges the two agencies' spellings of one place into one row", () => {
    // USGS shouts nothing and EMSC shouts everything, and somebody typing "flores" means both.
    const store = withEvents([
      reading({ source: "usgs", id: "u1", place: "Flores Sea", lon: 122, lat: -6 }),
      reading({ source: "emsc", id: "e1", place: "FLORES SEA", lon: 130, lat: -20, magnitude: 5.1 }),
    ]);
    const r = search("flores", store, filters, now);
    const hits = r.hits.filter((h) => h.kind === "place");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind === "place" && hits[0]!.count).toBe(2);
  });

  it("groups a sequence under one row rather than listing it", () => {
    const store = withEvents(
      Array.from({ length: 300 }, (_, i) =>
        reading({
          id: `s${i}`,
          place: "Flores Sea",
          lon: 122 + i * 0.01,
          lat: -6,
          magnitude: 2 + (i % 20) / 10,
        }),
      ),
    );
    const r = search("flores", store, filters, now);
    const hit = r.hits.find((h) => h.kind === "place");
    expect(hit!.kind === "place" && hit!.count).toBe(300);
  });

  it("flies to the strongest of a place, which is the one worth arriving at", () => {
    const store = withEvents([
      reading({ id: "small", place: "Flores Sea", lon: 122, lat: -6, magnitude: 2.1 }),
      reading({ id: "big", place: "Flores Sea", lon: 123, lat: -7, magnitude: 6.4 }),
      reading({ id: "mid", place: "Flores Sea", lon: 124, lat: -8, magnitude: 3.3 }),
    ]);
    const hit = search("flores", store, filters, now).hits.find((h) => h.kind === "place");
    expect(hit!.kind === "place" && hit!.strongest.primary.magnitude).toBe(6.4);
  });

  it("puts regions above places, since a region works when the buffer is empty", () => {
    const store = withEvents([reading({ id: "x", place: "Off Japan", lon: 141, lat: 38 })]);
    const r = search("japan", store, filters, now);
    expect(r.hits[0]!.kind).toBe("region");
  });

  it("prefers a match at the start of a word to one buried inside one", () => {
    // "Bridgetown" contains "ridge" and is not about a ridge, which is exactly the case ranking on
    // position exists for. Relevance before size: the bigger event is the buried one and still loses.
    const store = withEvents([
      reading({ id: "buried", place: "Bridgetown, Barbados", lon: -59, lat: 13, magnitude: 6.9 }),
      reading({ id: "lead", place: "Carlsberg Ridge", lon: 60, lat: -5, magnitude: 3.0 }),
    ]);
    const names = search("ridge", store, filters, now)
      .hits.filter((h) => h.kind === "place")
      .map((h) => (h.kind === "place" ? h.name : ""));
    expect(names[0]).toBe("Carlsberg Ridge");
    expect(names).toContain("Bridgetown, Barbados");
  });

  it("respects the filters, so results and globe cannot disagree", () => {
    const store = withEvents([reading({ id: "weak", place: "Flores Sea", magnitude: 2.0 })]);
    const strict = { ...filters, minMagnitude: 5 };
    expect(search("flores", store, strict, now).hits).toHaveLength(0);
  });
});

describe("what it will not do", () => {
  it("ignores a query too short to mean anything", () => {
    const store = withEvents([reading({ id: "x", place: "Japan Trench" })]);
    expect(search("j", store, filters, now).hits).toHaveLength(0);
    expect(search("", store, filters, now).hits).toHaveLength(0);
  });

  it("finds nothing for a real place that has had no earthquakes", () => {
    /*
     * Not a defect, and the reason the empty state has to name which of the two cases it is in. There
     * is no gazetteer behind this, so Paris is indistinguishable from a typo unless the app says so.
     */
    const store = withEvents([reading({ id: "x", place: "Flores Sea" })]);
    expect(search("paris", store, filters, now).hits).toHaveLength(0);
  });

  it("caps the place rows and says how many it left out", () => {
    // A silent cap reads as "that is everything", which is the one thing it is not.
    const store = withEvents(
      Array.from({ length: PLACE_LIMIT + 5 }, (_, i) =>
        reading({
          id: `p${i}`,
          place: `Ridge Sector ${i}`,
          lon: i,
          lat: 0,
        }),
      ),
    );
    const r = search("ridge", store, filters, now);
    expect(r.hits.filter((h) => h.kind === "place")).toHaveLength(PLACE_LIMIT);
    expect(r.more).toBe(5);
  });
});
