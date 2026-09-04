import { describe, expect, it } from "vitest";
import recorded from "./fixtures/usgs-all-hour.json";
import { createFakeRuntime, describeSourceContract, type FakeRuntime } from "./contract";
import { createUsgsSource, parseUsgs, usgsSeedFor } from "./usgs";

/* `recorded` is a real USGS hourly response, saved once and committed. Live-API tests are flaky and burn
 * quota, so exactly one exists and it is excluded from CI. */

const FEED_COUNT = (recorded as { features: unknown[] }).features.length;

const healthy = (): FakeRuntime =>
  createFakeRuntime({
    respond: async () => ({ ok: true, status: 200, json: async () => recorded }),
  });

const broken = (): FakeRuntime =>
  createFakeRuntime({
    respond: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });

describeSourceContract({
  name: "USGS",
  create: (runtime) => createUsgsSource(runtime, "https://example.invalid/feed"),
  runtime: (mode) => (mode === "healthy" ? healthy() : broken()),
  // A poller delivers by having its due timer fire. `start` polls immediately, so the first
  // delivery only needs the in-flight promise chain to settle.
  deliver: async (runtime) => {
    await runtime.flush();
    await runtime.advance(60_000);
  },
  expectedFirstBatch: FEED_COUNT,
});

describe("parsing a real USGS response", () => {
  it("turns every feature in the recording into a reading", () => {
    const { readings, skipped } = parseUsgs(recorded, 1_700_000_000_000);
    expect(readings).toHaveLength(FEED_COUNT);
    expect(skipped).toBe(0);
    expect(readings.every((r) => r.source === "usgs")).toBe(true);
  });

  it("keeps the magnitude scale rather than flattening it", () => {
    const { readings } = parseUsgs(recorded, 1_700_000_000_000);
    const scales = new Set(readings.map((r) => r.scale));
    // The recording contains mb, md and ml. If this ever collapses to one value, something is
    // normalising the scale away, which is the thing DESIGN.md section 10 forbids.
    expect(scales.size).toBeGreaterThan(1);
    expect([...scales].every((s) => s !== "unknown")).toBe(true);
  });
});

/* Hand-written rather than recorded, because these are the shapes a recording will not contain on the day you
 * take it. Every one of them has appeared in a real USGS response. */
describe("parsing what the feed does on a bad day", () => {
  const feature = (over: Record<string, unknown> = {}, geom: unknown = [141, 41, 30]) => ({
    id: "us1",
    geometry: { coordinates: geom },
    properties: {
      mag: 5,
      place: "somewhere",
      time: 1_700_000_000_000,
      magType: "mb",
      type: "earthquake",
      ...over,
    },
  });
  const parse = (features: unknown[]) => parseUsgs({ features }, 1_700_000_000_000);

  it("skips an event with no magnitude instead of drawing it at zero", () => {
    const { readings, skipped } = parse([feature({ mag: null })]);
    expect(readings).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("skips coordinates outside the sphere", () => {
    expect(parse([feature({}, [999, 41, 30])]).skipped).toBe(1);
    expect(parse([feature({}, [141, 200, 30])]).skipped).toBe(1);
  });

  it("names a missing magnitude scale rather than inventing one", () => {
    const { readings } = parse([feature({ magType: null })]);
    expect(readings[0]?.scale).toBe("unknown");
  });

  it("leaves a missing depth as NaN, never as a plausible zero", () => {
    const { readings } = parse([feature({}, [141, 41])]);
    expect(Number.isNaN(readings[0]?.depthKm)).toBe(true);
  });

  it("carries a quarry blast through as a quarry blast", () => {
    const { readings } = parse([feature({ type: "quarry blast" })]);
    expect(readings[0]?.kind).toBe("quarry blast");
  });

  it("survives a payload that is not a feed at all", () => {
    expect(parse.call(null, [])).toBeTruthy();
    expect(parseUsgs(null, 1).readings).toHaveLength(0);
    expect(parseUsgs({ features: "not an array" }, 1).readings).toHaveLength(0);
    expect(parseUsgs("<html>maintenance</html>", 1).readings).toHaveLength(0);
  });
});

describe("polling behaviour specific to USGS", () => {
  it("emits an event again once its solution is revised", async () => {
    let payload: unknown = {
      features: [
        {
          id: "us1",
          geometry: { coordinates: [141, 41, 30] },
          properties: { mag: 5, place: "a", time: 1_000, updated: 1_000, magType: "mb" },
        },
      ],
    };
    const runtime = createFakeRuntime({
      respond: async () => ({ ok: true, status: 200, json: async () => payload }),
    });
    const source = createUsgsSource(runtime, "https://example.invalid/feed");
    const seen: number[] = [];
    source.start({
      onReadings: (b) => seen.push(...b.map((r) => r.magnitude)),
      onStatus: () => {},
      onSeeded: () => {},
    });

    await runtime.flush();
    await runtime.advance(60_000);
    // Same event, same id, republished unchanged: must not be announced again.
    await runtime.advance(60_000);
    expect(seen).toEqual([5]);

    payload = {
      features: [
        {
          id: "us1",
          geometry: { coordinates: [141, 41, 30] },
          properties: { mag: 5.4, place: "a", time: 1_000, updated: 2_000, magType: "mww" },
        },
      ],
    };
    await runtime.advance(60_000);
    expect(seen).toEqual([5, 5.4]);
    source.stop();
  });

  it("polls immediately on start rather than waiting out the first interval", async () => {
    let calls = 0;
    const runtime = createFakeRuntime({
      respond: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => recorded };
      },
    });
    const source = createUsgsSource(runtime, "https://example.invalid/feed");
    source.start({ onReadings: () => {}, onStatus: () => {}, onSeeded: () => {} });
    await runtime.flush();

    // A minute of empty globe on load would fail DESIGN.md section 8 outright.
    expect(calls).toBe(1);
    source.stop();
  });
});

describe("felt reports", () => {
  it("keeps the count and the reported intensity when the feed carries them", () => {
    const { readings } = parseUsgs(recorded, 1_700_000_000_000);
    const hawaii = readings.find((r) => r.place.includes("Honaunau"));
    expect(hawaii?.felt).toEqual({ reports: 77, intensity: 3.9 });
  });

  it("leaves it absent when nobody reported, rather than setting zero", () => {
    // "Nobody felt it" and "the agency has no report" are different claims, and only the second is one this
    // app can make. A zero would be the first, printed as a fact, on every event in the ocean.
    const feed = {
      type: "FeatureCollection",
      features: [
        {
          id: "quiet",
          properties: {
            mag: 5.1,
            magType: "mb",
            place: "somewhere",
            time: 1_700_000_000_000,
            felt: null,
            cdi: null,
          },
          geometry: { type: "Point", coordinates: [10, 20, 30] },
        },
      ],
    };
    const [reading] = parseUsgs(feed, 1_700_000_000_000).readings;
    expect(reading?.felt).toBeUndefined();
  });

  it("refuses an intensity with no reports under it", () => {
    const feed = {
      type: "FeatureCollection",
      features: [
        {
          id: "odd",
          properties: {
            mag: 5.1,
            magType: "mb",
            place: "somewhere",
            time: 1_700_000_000_000,
            felt: 0,
            cdi: 4.2,
          },
          geometry: { type: "Point", coordinates: [10, 20, 30] },
        },
      ],
    };
    const [reading] = parseUsgs(feed, 1_700_000_000_000).readings;
    expect(reading?.felt).toBeUndefined();
  });
});

describe("the review state", () => {
  it("keeps the agency's own two words", () => {
    const make = (status: unknown) => ({
      type: "FeatureCollection",
      features: [
        {
          id: "x",
          properties: { mag: 5, magType: "mb", place: "somewhere", time: 1_700_000_000_000, status },
          geometry: { type: "Point", coordinates: [10, 20, 30] },
        },
      ],
    });
    expect(parseUsgs(make("automatic"), 1).readings[0]?.review).toBe("automatic");
    expect(parseUsgs(make("reviewed"), 1).readings[0]?.review).toBe("reviewed");
  });

  it("drops anything else, including the third value USGS actually sends", () => {
    // "deleted" is real, and a fourth word could arrive whenever USGS decides. An unknown state must read as
    // "the agency did not say" rather than being folded into one of the two that mean something.
    const make = (status: unknown) => ({
      type: "FeatureCollection",
      features: [
        {
          id: "x",
          properties: { mag: 5, magType: "mb", place: "somewhere", time: 1_700_000_000_000, status },
          geometry: { type: "Point", coordinates: [10, 20, 30] },
        },
      ],
    });
    for (const odd of ["deleted", "REVIEWED", "", null, undefined, 1]) {
      expect(parseUsgs(make(odd), 1).readings[0]?.review, String(odd)).toBeUndefined();
    }
  });

  it("reads it off the recorded feed, where every event has one", () => {
    const { readings } = parseUsgs(recorded, 1_700_000_000_000);
    const stated = readings.filter((r) => r.review !== undefined);
    expect(stated.length).toBe(readings.length);
  });
});

describe("the modelled shaking", () => {
  const make = (mmi: unknown) => ({
    type: "FeatureCollection",
    features: [
      {
        id: "x",
        properties: { mag: 5, magType: "mb", place: "somewhere", time: 1_700_000_000_000, mmi },
        geometry: { type: "Point", coordinates: [10, 20, 30] },
      },
    ],
  });

  it("keeps a real estimate", () => {
    expect(parseUsgs(make(3.024), 1).readings[0]?.shaking).toBeCloseTo(3.024, 3);
  });

  it("is absent far more often than present, and absent is not zero", () => {
    for (const none of [null, undefined, 0, "4", Number.NaN]) {
      expect(parseUsgs(make(none), 1).readings[0]?.shaking, String(none)).toBeUndefined();
    }
  });

  it("is rarer than the felt count on the recorded feed", () => {
    // USGS builds a shaking map for a fraction of what people report on, so a parser reading the wrong field
    // would show up here as the two counts matching.
    const { readings } = parseUsgs(recorded, 1_700_000_000_000);
    const mapped = readings.filter((r) => r.shaking !== undefined).length;
    const reported = readings.filter((r) => r.felt !== undefined).length;
    expect(mapped).toBeLessThanOrEqual(reported);
  });
});

describe("the contributing network", () => {
  it("keeps the code the agency uses", () => {
    // USGS aggregates: `hv` is the Hawaiian Volcano Observatory, `ci` southern California. The app said
    // "reported by USGS" for solutions it had only relayed.
    const { readings } = parseUsgs(recorded, 1_700_000_000_000);
    const hawaii = readings.find((r) => r.place.includes("Honaunau"));
    expect(hawaii?.network).toBe("hv");
    // Every event in this feed names one, so a parser reading the wrong key shows up as none.
    expect(readings.every((r) => r.network !== undefined)).toBe(true);
  });

  it("is absent rather than blank when the agency did not say", () => {
    const make = (net: unknown) => ({
      type: "FeatureCollection",
      features: [
        {
          id: "x",
          properties: { mag: 5, magType: "mb", place: "somewhere", time: 1_700_000_000_000, net },
          geometry: { type: "Point", coordinates: [10, 20, 30] },
        },
      ],
    });
    for (const none of [null, undefined, "", "   ", 7]) {
      expect(parseUsgs(make(none), 1).readings[0]?.network, String(none)).toBeUndefined();
    }
  });
});

describe("which backlog to ask for", () => {
  const DAY = 86_400_000;

  /*
   * The day is 0.23MB, the week 1.5MB, the month 7.4MB. A rung in the wrong place is a thirty-fold
   * download for a window that never needed it, on an app whose whole premise is costing nothing.
   */
  it("asks for the smallest file that covers the window", () => {
    expect(usgsSeedFor(DAY), "a day wants the day").toContain("all_day");
    expect(usgsSeedFor(2 * DAY), "over a day wants the week").toContain("all_week");
    expect(usgsSeedFor(7 * DAY), "a week still fits in the week").toContain("all_week");
    expect(usgsSeedFor(8 * DAY), "over a week wants the month").toContain("all_month");
    expect(usgsSeedFor(30 * DAY)).toContain("all_month");
  });

  it("never asks for more than the month, however far back the viewer goes", () => {
    expect(usgsSeedFor(365 * DAY)).toContain("all_month");
  });
});
