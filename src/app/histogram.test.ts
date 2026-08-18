import { describe, expect, it } from "vitest";
import { HOURS, countWithin, histogram, peakCount } from "./histogram";
import type { Filters, Quake, Reading } from "../data/types";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

let n = 0;
const quake = (over: Partial<Reading> = {}): Quake => {
  const primary: Reading = {
    source: "usgs", id: `a${(n += 1)}`, magnitude: 5.2, scale: "Mww", lon: 141.3, lat: 41.8,
    depthKm: 40, time: NOW - HOUR, place: "somewhere", kind: "earthquake",
    receivedAt: NOW - HOUR, ...over,
  };
  return { key: `q${n}`, readings: [primary], primary };
};

const filters = (over: Partial<Filters> = {}): Filters => ({
  minMagnitude: 2,
  windowMs: 24 * HOUR,
  sources: new Set(["usgs", "emsc"]),
  ...over,
});

const walk = (quakes: Quake[]) => (fn: (q: Quake) => void) => quakes.forEach(fn);

describe("the activity histogram", () => {
  it("reads oldest first, so the array is the axis", () => {
    const bars = histogram(walk([]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars).toHaveLength(HOURS);
    expect(bars[0]!.hoursAgo).toBe(23);
    expect(bars[HOURS - 1]!.hoursAgo).toBe(0);
  });

  it("puts an event in the hour it happened, not the hour it arrived", () => {
    // Twenty minutes old, delivered a moment ago. It belongs in the current hour either way, so
    // the case that matters is the one that straddles a boundary.
    const late = quake({ time: NOW - 90 * 60_000, receivedAt: NOW - 1_000 });
    const bars = histogram(walk([late]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.hoursAgo === 1)!.count).toBe(1);
    expect(bars.find((b) => b.hoursAgo === 0)!.count).toBe(0);
  });

  it("ignores the window filter, because it is the control for it", () => {
    const old = quake({ time: NOW - 20 * HOUR });
    const bars = histogram(walk([old]), filters({ windowMs: HOUR }), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.hoursAgo === 20)!.count).toBe(1);
  });

  it("applies magnitude and source, because the strip must match the globe", () => {
    const small = quake({ magnitude: 2.5 });
    const emsc = quake({ source: "emsc" });
    expect(peakCount(histogram(walk([small]), filters({ minMagnitude: 4 }), NOW, null))).toBe(0);
    expect(peakCount(histogram(walk([emsc]), filters({ sources: new Set(["usgs"]) }), NOW, null)))
      .toBe(0);
  });

  it("keeps the strongest magnitude in each hour, not the last one seen", () => {
    const bars = histogram(
      walk([quake({ magnitude: 6.1 }), quake({ magnitude: 3.0 })]),
      filters(), NOW, NOW - 24 * HOUR,
    );
    expect(bars.find((b) => b.hoursAgo === 1)!.peak).toBe(6.1);
  });

  it("marks an hour the buffer only partly covers as unobserved", () => {
    // Opened 90 minutes ago: the hour ending now is covered, the one before it is not.
    const bars = histogram(walk([]), filters(), NOW, NOW - 90 * 60_000);
    expect(bars.find((b) => b.hoursAgo === 0)!.observed).toBe(true);
    expect(bars.find((b) => b.hoursAgo === 1)!.observed).toBe(false);
    expect(bars.find((b) => b.hoursAgo === 2)!.observed).toBe(false);
  });

  it("treats an empty buffer as having observed nothing", () => {
    expect(histogram(walk([]), filters(), NOW, null).every((b) => !b.observed)).toBe(true);
  });

  it("keeps a future-dated event rather than dropping it", () => {
    // Clock skew between an agency and the browser. The window filter accepts it and the globe
    // draws it, so a strip that dropped it would not total the picture beside it.
    const ahead = quake({ time: NOW + 4_000 });
    const bars = histogram(walk([ahead]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.hoursAgo === 0)!.count).toBe(1);
  });

  it("totals exactly the events inside the window", () => {
    const bars = histogram(
      walk([quake({ time: NOW - 30 * 60_000 }), quake({ time: NOW - 3 * HOUR }),
            quake({ time: NOW - 20 * HOUR })]),
      filters(), NOW, NOW - 24 * HOUR,
    );
    expect(countWithin(bars, 24)).toBe(3);
    expect(countWithin(bars, 6)).toBe(2);
    expect(countWithin(bars, 1)).toBe(1);
  });

  it("drops events older than the strip rather than piling them into the last bar", () => {
    const ancient = quake({ time: NOW - 40 * HOUR });
    expect(peakCount(histogram(walk([ancient]), filters(), NOW, NOW - 24 * HOUR))).toBe(0);
  });
});
