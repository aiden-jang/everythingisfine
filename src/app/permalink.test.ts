import { describe, expect, it } from "vitest";
import { decode, encode, type Permalink } from "./permalink";

const state: Permalink = {
  lon: 145, lat: 12, zoom: 1, minMagnitude: 2, windowHours: 24,
  sources: ["usgs", "emsc"], ramp: "thermal", event: null,
};

describe("longitude on the way out", () => {
  it("wraps a camera that has been round the world", () => {
    // The spring takes the shortest way round, so crossing the date line adds a turn to `lon` and
    // nothing takes it off again. Links were coming out as at=499.37.
    const at = (lon: number): string => encode({
      lon, lat: 20, zoom: 1, minMagnitude: 2, windowHours: 24,
      sources: ["usgs"], ramp: "thermal", event: null,
    }).split("&")[0]!;

    expect(at(499.37)).toBe("at=139.37,20,1");
    expect(at(-190)).toBe("at=170,20,1");
    expect(at(180)).toBe("at=-180,20,1");
    expect(at(140)).toBe("at=140,20,1");
  });
});

describe("permalinks", () => {
  it("survives a round trip", () => {
    const full: Permalink = {
      ...state, lon: -71.5, lat: -25.25, zoom: 1.8, minMagnitude: 4.5,
      ramp: "cividis", event: "usgs:us7000abcd",
    };
    expect(decode(encode(full))).toEqual({
      lon: -71.5, lat: -25.25, zoom: 1.8, minMagnitude: 4.5, windowHours: 24,
      sources: ["emsc", "usgs"], ramp: "cividis", event: "usgs:us7000abcd",
    });
  });

  it("names the event the way the agency does, never the way we do", () => {
    const encoded = encode({ ...state, event: "emsc:20260817_0000653" });
    expect(encoded).toContain("e=emsc:20260817_0000653");
    // Our own key is an arrival counter: stable within one page, meaningless across two. A link
    // carrying `q12` would restore a different earthquake, which is worse than restoring none.
    expect(encoded).not.toMatch(/e=q\w+/);
  });

  it("does not claim camera precision it does not have", () => {
    const encoded = encode({ ...state, lon: 145.123456789, lat: 12.987654321 });
    expect(encoded).toContain("at=145.12,12.99,1");
  });

  it("ignores a fragment that is not ours", () => {
    expect(decode("")).toEqual({});
    expect(decode("#section-two")).toEqual({});
    expect(decode("#at=nonsense")).toEqual({});
  });

  it("clamps a hand-edited camera rather than obeying it", () => {
    const out = decode("at=999,-400,50");
    // Longitude wraps, latitude and zoom clamp. A URL is untrusted input in the most ordinary way:
    // people edit them, and an old link outlives the shape it was written against.
    expect(out.lon).toBeCloseTo(-81, 5);
    expect(out.lat).toBe(-85);
    expect(out.zoom).toBe(3);
  });

  it("drops a source or ramp it does not recognise", () => {
    expect(decode("s=usgs,gossip&r=neon")).toEqual({ sources: ["usgs"] });
  });

  it("honours an empty source list, because showing nothing is a real state", () => {
    expect(decode("s=")).toEqual({ sources: [] });
  });

  it("rejects an event identifier that is not shaped like one", () => {
    expect(decode("e=q12").event).toBeUndefined();
    expect(decode("e=usgs:").event).toBeUndefined();
    expect(decode("e=<script>").event).toBeUndefined();
    expect(decode("e=usgs:us7000abcd").event).toBe("usgs:us7000abcd");
  });
});
