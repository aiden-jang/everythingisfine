import { describe, expect, it } from "vitest";
import { matches, passesWindow, windowStart } from "./filter";
import type { Filters, Quake, Reading } from "./types";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

const quake = (over: Partial<Reading> = {}): Quake => {
  const primary: Reading = {
    source: "usgs",
    id: "a1",
    magnitude: 5.2,
    scale: "Mww",
    lon: 141.3,
    lat: 41.8,
    depthKm: 40,
    time: NOW - HOUR,
    place: "somewhere",
    kind: "earthquake",
    receivedAt: NOW - HOUR + 20_000,
    ...over,
  };
  return { key: "q1", readings: [primary], primary };
};

const filters = (over: Partial<Filters> = {}): Filters => ({
  minMagnitude: 2,
  windowMs: 24 * HOUR,
  sources: new Set(["usgs", "emsc"]),
  ...over,
});

describe("filters", () => {
  it("includes an event exactly on the magnitude floor", () => {
    expect(matches(quake({ magnitude: 4 }), filters({ minMagnitude: 4 }), NOW)).toBe(true);
    expect(matches(quake({ magnitude: 3.9 }), filters({ minMagnitude: 4 }), NOW)).toBe(false);
  });

  it("includes an event exactly on the window edge", () => {
    expect(passesWindow(quake({ time: NOW - HOUR }), NOW, HOUR)).toBe(true);
    expect(passesWindow(quake({ time: NOW - HOUR - 1 }), NOW, HOUR)).toBe(false);
  });

  it("selects on origin time, never on arrival", () => {
    // Happened two hours ago, reached us a second ago. It belongs two hours back.
    const late = quake({ time: NOW - 2 * HOUR, receivedAt: NOW - 1000 });
    expect(passesWindow(late, NOW, HOUR)).toBe(false);
  });

  it("shows an event if any reporting source is enabled", () => {
    const both = quake();
    both.readings.push({ ...both.primary, source: "emsc", id: "e1" });
    expect(matches(both, filters({ sources: new Set(["emsc"]) }), NOW)).toBe(true);
    expect(matches(both, filters({ sources: new Set() }), NOW)).toBe(false);
  });
});

describe("the honest left edge", () => {
  it("reports the requested window once it has genuinely filled", () => {
    expect(windowStart(NOW, 24 * HOUR, NOW - 30 * HOUR)).toEqual({
      at: NOW - 24 * HOUR,
      complete: true,
    });
  });

  it("reports when the page loaded, while the window is still filling", () => {
    // Open for forty minutes, asking for twenty-four hours. Saying "last 24 hours" here is a lie.
    const opened = NOW - 40 * 60_000;
    expect(windowStart(NOW, 24 * HOUR, opened)).toEqual({ at: opened, complete: false });
  });

  it("is not complete before any coverage exists", () => {
    /* This asserted `true` and was written when the argument was the earliest arrival: nothing held meant
       nothing to contradict the window. See ARCHITECTURE.md#srcdatafiltertestts. */
    expect(windowStart(NOW, HOUR, null)).toEqual({ at: NOW, complete: false });
  });
});
