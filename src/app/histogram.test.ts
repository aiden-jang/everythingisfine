import { describe, expect, it } from "vitest";
import { BUCKETS, energyOf, histogram, peakCount, totalIn } from "./histogram";
import { energyPercent } from "./format";
import type { Filters, Quake, Reading } from "../data/types";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

let n = 0;
const quake = (over: Partial<Reading> = {}): Quake => {
  const primary: Reading = {
    source: "usgs",
    id: `a${(n += 1)}`,
    magnitude: 5.2,
    scale: "Mww",
    lon: 141.3,
    lat: 41.8,
    depthKm: 40,
    time: NOW - HOUR,
    place: "somewhere",
    kind: "earthquake",
    receivedAt: NOW - HOUR,
    ...over,
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
   * The reverse of what this asserted before. The strip used to ignore `windowMs` because the strip was the
   * control that set it; the window is chosen by name now and the strip is always exactly it, so the
   * alternative is the bars totalling a day beside a globe drawing an hour.
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
    expect(peakCount(histogram(walk([emsc]), filters({ sources: new Set(["usgs"]) }), NOW, null).bars)).toBe(
      0,
    );
  });

  it("keeps the strongest magnitude in each hour, not the last one seen", () => {
    const { bars } = histogram(
      walk([quake({ magnitude: 6.1 }), quake({ magnitude: 3.0 })]),
      filters(),
      NOW,
      NOW - 24 * HOUR,
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
      walk([
        quake({ time: NOW - 30 * 60_000 }),
        quake({ time: NOW - 3 * HOUR }),
        quake({ time: NOW - 20 * HOUR }),
      ]),
      filters(),
      NOW,
      NOW - 24 * HOUR,
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
      walk([small, big, filtered]),
      filters({ sources: new Set(["usgs"]) }),
      NOW,
      null,
    );
    expect(strongest?.primary.id).toBe("big");
  });

  it("is null when nothing is in the window", () => {
    expect(histogram(walk([]), filters(), NOW, null).strongest).toBeNull();
  });
});

describe("the energy the window released", () => {
  it("grows a thousandfold every two points of magnitude", () => {
    // The relation the whole feature exists to make legible.
    expect(energyOf(6) / energyOf(4)).toBeCloseTo(1000, 6);
    expect(energyOf(5) / energyOf(4)).toBeCloseTo(31.62, 2);
  });

  it("gives one large event almost all of a busy window", () => {
    // The number that makes this worth printing. One M6.4 against four hundred events near M2.5: the big one
    // is better than 99.9 percent of the energy.
    const many = Array.from({ length: 400 }, (_, i) => quake({ magnitude: 2.5, time: NOW - i * 60_000 }));
    const big = quake({ magnitude: 6.4, time: NOW - HOUR });
    const { energyShare } = histogram(walk([...many, big]), filters(), NOW, NOW - 24 * HOUR);
    expect(energyShare!).toBeGreaterThan(0.999);
  });

  it("gives no dominant event only a modest share", () => {
    // A window of similar magnitudes splits the energy, and the sentence is suppressed below a half
    // for exactly this case: there is nothing to teach when nothing dominates.
    const many = Array.from({ length: 400 }, (_, i) => quake({ magnitude: 2.5, time: NOW - i * 60_000 }));
    const top = quake({ magnitude: 4, time: NOW - HOUR });
    const { energyShare } = histogram(walk([...many, top]), filters(), NOW, NOW - 24 * HOUR);
    expect(energyShare!).toBeLessThan(0.5);
    expect(energyShare!).toBeGreaterThan(0.1);
  });

  it("is the whole of a window holding one event", () => {
    const { energyShare } = histogram(walk([quake({ magnitude: 5 })]), filters(), NOW, NOW - 24 * HOUR);
    expect(energyShare!).toBeCloseTo(1, 9);
  });

  it("is null when nothing passes, rather than a zero to divide by", () => {
    expect(histogram(walk([]), filters(), NOW, NOW - 24 * HOUR).energyShare).toBeNull();
    expect(
      histogram(walk([quake({ magnitude: 3 })]), filters({ minMagnitude: 9 }), NOW, NOW - 24 * HOUR)
        .energyShare,
    ).toBeNull();
  });

  it("tracks the share of the same event it calls strongest", () => {
    // The winner changes during the walk, so these two have to come from one source or they drift.
    const qs = [quake({ magnitude: 3 }), quake({ magnitude: 6.1 }), quake({ magnitude: 4 })];
    const out = histogram(walk(qs), filters(), NOW, NOW - 24 * HOUR);
    expect(out.strongest!.primary.magnitude).toBe(6.1);
    expect(out.energyShare!).toBeCloseTo(energyOf(6.1) / (energyOf(3) + energyOf(6.1) + energyOf(4)), 9);
  });

  it("counts only what the filters admit, so the share describes the picture", () => {
    const qs = [quake({ magnitude: 6.4 }), quake({ magnitude: 1.5 })];
    // The 1.5 is below the floor, so it is neither drawn nor counted against the total.
    const out = histogram(walk(qs), filters({ minMagnitude: 2 }), NOW, NOW - 24 * HOUR);
    expect(out.energyShare!).toBeCloseTo(1, 9);
  });
});

describe("stating that share honestly", () => {
  it("refuses to round 99.94 up to a whole truth it does not have", () => {
    // The remainder is not nothing, it is four hundred events.
    expect(energyPercent(0.9994)).toBe("over 99.9%");
    expect(energyPercent(0.99999)).toBe("over 99.9%");
  });

  it("keeps a decimal only while it is doing work", () => {
    expect(energyPercent(0.994)).toBe("99.4%");
    expect(energyPercent(0.31)).toBe("31%");
  });

  it("says none rather than printing a nonsense percentage", () => {
    expect(energyPercent(0)).toBe("none");
    expect(energyPercent(Number.NaN)).toBe("none");
  });
});

describe("corroboration inside the span both feeds cover", () => {
  const both = (id: string, time: number): Quake => {
    const usgs: Reading = { ...quake({ id: `u${id}`, time }).primary, source: "usgs" };
    const emsc: Reading = { ...usgs, source: "emsc", id: `e${id}` };
    return { key: `k${id}`, readings: [usgs, emsc], primary: usgs };
  };

  it("counts only what falls inside the overlap", () => {
    const overlapFrom = NOW - 3 * HOUR;
    const qs = [
      both("a", NOW - HOUR),
      both("b", NOW - 2 * HOUR),
      // Older than the overlap: corroborated, and not corroboration this can claim.
      both("c", NOW - 10 * HOUR),
      quake({ id: "solo", time: NOW - HOUR }),
    ];
    const out = histogram(walk(qs), filters(), NOW, NOW - 24 * HOUR, overlapFrom);
    expect(out.overlap).toEqual({ events: 3, both: 2 });
  });

  it("is null when the feeds do not overlap, which is not a rate of zero", () => {
    const out = histogram(walk([quake()]), filters(), NOW, NOW - 24 * HOUR, null);
    expect(out.overlap).toBeNull();
  });

  it("counts an event as corroborated by having more than one reading, not by source names", () => {
    // The store keeps at most one reading per source, so more than one reading is more than one agency.
    const out = histogram(walk([both("a", NOW - HOUR)]), filters(), NOW, NOW - 24 * HOUR, NOW - HOUR);
    expect(out.overlap).toEqual({ events: 1, both: 1 });
  });

  it("respects the filters, so the rate describes what is on screen", () => {
    const qs = [both("a", NOW - HOUR)];
    const out = histogram(walk(qs), filters({ minMagnitude: 9 }), NOW, NOW - 24 * HOUR, NOW - HOUR);
    expect(out.overlap).toEqual({ events: 0, both: 0 });
  });
});

describe("naming the event behind each bar", () => {
  const at = (bucketsAgo: number) => NOW - bucketsAgo * HOUR - HOUR / 2;

  it("carries the strongest event in the bucket, not merely its magnitude", () => {
    const big = quake({ magnitude: 6.1, time: at(3) });
    const small = quake({ magnitude: 3.0, time: at(3) });
    const { bars } = histogram(walk([small, big]), filters(), NOW, NOW - 24 * HOUR);
    const bar = bars.find((b) => b.bucketsAgo === 3)!;
    expect(bar.lead?.key).toBe(big.key);
    expect(bar.lead?.magnitude).toBe(6.1);
  });

  it("leaves an empty bucket without a lead, so the strip marks nothing there", () => {
    const { bars } = histogram(walk([quake({ time: at(3) })]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.bucketsAgo === 7)!.lead).toBeNull();
  });

  it("places the tick at the moment, not at the middle of its bucket", () => {
    // Six hours back in a 24-hour window is three quarters of the way along.
    const { bars } = histogram(walk([quake({ time: NOW - 6 * HOUR })]), filters(), NOW, NOW - 24 * HOUR);
    const bar = bars.find((b) => b.lead !== null)!;
    expect(bar.lead!.position).toBeCloseTo(0.75, 5);
  });

  it("keeps a future origin time inside the strip rather than off its right edge", () => {
    // Agencies and browsers disagree about the clock by a second or two, and the window filter accepts it.
    const { bars } = histogram(walk([quake({ time: NOW + 2_000 })]), filters(), NOW, NOW - 24 * HOUR);
    expect(bars.find((b) => b.lead !== null)!.lead!.position).toBe(1);
  });

  it("ignores what the filters already excluded, so no tick outlives its bar", () => {
    const { bars } = histogram(
      walk([quake({ magnitude: 1.1, time: at(2) })]),
      filters({ minMagnitude: 2 }),
      NOW,
      NOW - 24 * HOUR,
    );
    expect(bars.every((b) => b.lead === null)).toBe(true);
  });
});
