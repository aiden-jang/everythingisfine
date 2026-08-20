import { describe, expect, it } from "vitest";
import { BUCKETS, histogram, peakCount, totalIn } from "./histogram";
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
    const { bars } = histogram(walk([]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars).toHaveLength(BUCKETS);
    expect(bars[0]!.bucketsAgo).toBe(23);
    expect(bars[BUCKETS - 1]!.bucketsAgo).toBe(0);
  });

  it("puts an event in the hour it happened, not the hour it arrived", () => {
    // Twenty minutes old, delivered a moment ago. It belongs in the current hour either way, so
    // the case that matters is the one that straddles a boundary.
    const late = quake({ time: NOW - 90 * 60_000, receivedAt: NOW - 1_000 });
    const { bars } = histogram(walk([late]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.bucketsAgo === 1)!.count).toBe(1);
    expect(bars.find((b) => b.bucketsAgo === 0)!.count).toBe(0);
  });

  /*
   * The reverse of what this asserted before, and deliberately.
   *
   * The strip used to ignore `windowMs` because the strip was the control that set it, so it had to
   * keep showing the hours it was about to exclude. The window is chosen by name now and the strip is
   * always exactly it, which means respecting the filter is the whole point: the alternative is the
   * bars totalling a day beside a globe drawing an hour.
   */
  it("spans exactly the window, because it no longer sets it", () => {
    const old = quake({ time: NOW - 20 * HOUR });
    const { bars } = histogram(walk([old]), filters({ windowMs: HOUR }), NOW, NOW - 24 * HOUR);
    expect(totalIn(bars)).toBe(0);
  });

  it("applies magnitude and source, because the strip must match the globe", () => {
    const small = quake({ magnitude: 2.5 });
    const emsc = quake({ source: "emsc" });
    expect(peakCount(histogram(walk([small]), filters({ minMagnitude: 4 }), NOW, null).bars)).toBe(0);
    expect(peakCount(histogram(walk([emsc]), filters({ sources: new Set(["usgs"]) }), NOW, null).bars))
      .toBe(0);
  });

  it("keeps the strongest magnitude in each hour, not the last one seen", () => {
    const { bars } = histogram(
      walk([quake({ magnitude: 6.1 }), quake({ magnitude: 3.0 })]),
      filters(), NOW, NOW - 24 * HOUR,
    );
    expect(bars.find((b) => b.bucketsAgo === 1)!.peak).toBe(6.1);
  });

  it("marks an hour the buffer only partly covers as unobserved", () => {
    // Opened 90 minutes ago: the hour ending now is covered, the one before it is not.
    const { bars } = histogram(walk([]), filters(), NOW, NOW - 90 * 60_000);
    expect(bars.find((b) => b.bucketsAgo === 0)!.observed).toBe(true);
    expect(bars.find((b) => b.bucketsAgo === 1)!.observed).toBe(false);
    expect(bars.find((b) => b.bucketsAgo === 2)!.observed).toBe(false);
  });

  it("treats an empty buffer as having observed nothing", () => {
    expect(histogram(walk([]), filters(), NOW, null).bars.every((b) => !b.observed)).toBe(true);
  });

  it("keeps a future-dated event rather than dropping it", () => {
    // Clock skew between an agency and the browser. The window filter accepts it and the globe
    // draws it, so a strip that dropped it would not total the picture beside it.
    const ahead = quake({ time: NOW + 4_000 });
    const { bars } = histogram(walk([ahead]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.bucketsAgo === 0)!.count).toBe(1);
  });

  it("totals exactly the events inside the window", () => {
    const { bars } = histogram(
      walk([quake({ time: NOW - 30 * 60_000 }), quake({ time: NOW - 3 * HOUR }),
            quake({ time: NOW - 20 * HOUR })]),
      filters(), NOW, NOW - 24 * HOUR,
    );
    expect(totalIn(bars)).toBe(3);
  });

  it("divides whatever window it is given into the same number of bars", () => {
    const week = filters({ windowMs: 7 * 24 * HOUR });
    const { bars, bucketMs } = histogram(walk([]), week, NOW, NOW - 7 * 24 * HOUR);
    expect(bars).toHaveLength(BUCKETS);
    expect(bucketMs).toBe(7 * HOUR);
  });

  it("buckets a week by the week's own bucket, not by the hour", () => {
    const week = filters({ windowMs: 7 * 24 * HOUR });
    // Ten hours back is inside the second seven-hour bucket, and would be bucket 10 of an hourly
    // strip. Getting this wrong is how a week's worth of events piles into the first bar.
    const { bars } = histogram(walk([quake({ time: NOW - 10 * HOUR })]), week, NOW, null);
    expect(bars.find((b) => b.bucketsAgo === 1)!.count).toBe(1);
    expect(totalIn(bars)).toBe(1);
  });

  it("keeps a month's oldest events, which an hourly strip would have dropped", () => {
    const month = filters({ windowMs: 30 * 24 * HOUR });
    const old = quake({ time: NOW - 25 * 24 * HOUR });
    const { bars } = histogram(walk([old]), month, NOW, null);
    expect(totalIn(bars)).toBe(1);
    expect(bars.find((b) => b.bucketsAgo === 20)!.count).toBe(1);
  });

  it("drops events older than the strip rather than piling them into the last bar", () => {
    const ancient = quake({ time: NOW - 40 * HOUR });
    expect(peakCount(histogram(walk([ancient]), filters(), NOW, NOW - 24 * HOUR).bars)).toBe(0);
  });
});

describe("the strongest event in the window", () => {
  it("is the largest that passes the filters, not the largest held", () => {
    const big = quake({ magnitude: 6.4, id: "big" });
    const small = quake({ magnitude: 3.1, id: "small" });
    const filtered = quake({ magnitude: 7.2, id: "emsc-only", source: "emsc" });

    const { strongest } = histogram(
      walk([small, big, filtered]), filters({ sources: new Set(["usgs"]) }), NOW, null,
    );
    expect(strongest?.primary.id).toBe("big");
  });

  it("is null when nothing is in the window", () => {
    expect(histogram(walk([]), filters(), NOW, null).strongest).toBeNull();
  });
});
