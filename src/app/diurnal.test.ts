import { describe, expect, it } from "vitest";
import { BINS, departure, dialPoint, diurnal } from "./diurnal";
import { solarHour } from "../geo/sun";
import type { Filters, Quake, Reading } from "../data/types";

/*
 * A chart whose payload is a null result has to be able to show a signal, or the flatness it reports is
 * an artefact of the drawing. Most of what follows is that: feed it a signal and check it appears.
 */

const now = Date.UTC(2026, 2, 15, 12, 0, 0);

const filters: Filters = {
  minMagnitude: 0, windowMs: 30 * 24 * 3_600_000, sources: new Set(["usgs", "emsc"]),
};

const quakeAt = (lon: number, time: number, i: number): Quake => {
  const r: Reading = {
    source: "usgs", id: `q${i}`, magnitude: 4, scale: "ml", lon, lat: 0, depthKm: 10,
    time, place: "Somewhere", kind: "earthquake", receivedAt: time,
  };
  return { key: `k${i}`, readings: [r], primary: r };
};

/** A walker over a fixed list, shaped like the store's own. */
const over = (quakes: Quake[]) => (fn: (q: Quake) => void): void => { quakes.forEach(fn); };

describe("binning on local solar time", () => {
  it("puts an event at its own solar hour, not its UTC hour", () => {
    /*
     * The whole reason solar time was built first. Two events at the same instant, a third of the world
     * apart, are at different times of day and must land in different bins. On UTC they would land in
     * the same one, which is how a real signal gets flattened into the null result being looked for.
     */
    const at = Date.UTC(2026, 2, 15, 0, 0, 0);
    const a = quakeAt(0, at, 1);
    const b = quakeAt(120, at, 2);
    const found = diurnal(over([a, b]), filters, now).counts;
    const binA = Math.floor(solarHour(0, at));
    const binB = Math.floor(solarHour(120, at));
    expect(binA).not.toBe(binB);
    expect(found[binA]).toBe(1);
    expect(found[binB]).toBe(1);
  });

  it("counts everything once and keeps a total that matches", () => {
    const qs = Array.from({ length: 96 }, (_, i) =>
      quakeAt((i * 3.75) - 180, now - i * 3_600_000, i));
    const d = diurnal(over(qs), filters, now);
    expect(d.total).toBe(96);
    expect(d.counts.reduce((a, b) => a + b, 0)).toBe(96);
    expect(d.counts).toHaveLength(BINS);
  });

  it("respects the filters, so the dial and the globe cannot disagree", () => {
    const qs = [quakeAt(0, now - 3_600_000, 1)];
    const strict = { ...filters, minMagnitude: 6 };
    expect(diurnal(over(qs), strict, now).total).toBe(0);
  });

  it("never lands a bin outside the dial, whatever the float does", () => {
    // `solarHour` is [0, 24) and the floor of 23.9999999 must still be 23.
    for (let lon = -180; lon <= 180; lon += 0.5) {
      const d = diurnal(over([quakeAt(lon, now - 1000, 1)]), filters, now);
      expect(d.counts.findIndex((n) => n > 0)).toBeGreaterThanOrEqual(0);
      expect(d.counts.findIndex((n) => n > 0)).toBeLessThan(BINS);
    }
  });

  it("has no scatter to speak of when there is nothing in it", () => {
    const d = diurnal(over([]), filters, now);
    expect(d.total).toBe(0);
    expect(d.mean).toBe(0);
    expect(d.worst).toBe(0);
  });
});

describe("the expected scatter", () => {
  it("is the Poisson width of an even spread", () => {
    const qs = Array.from({ length: 240 }, (_, i) =>
      quakeAt((i * 1.5) - 180, now - i * 600_000, i));
    const d = diurnal(over(qs), filters, now);
    expect(d.mean).toBeCloseTo(10, 9);
    expect(d.sigma).toBeCloseTo(Math.sqrt(10), 9);
  });

  it("reports the worst bin in units of that scatter", () => {
    // Everything at one longitude and one instant: every event in a single bin, which is as far from
    // flat as 24 bins can get, and the number has to say so loudly.
    const at = Date.UTC(2026, 2, 15, 6, 0, 0);
    const qs = Array.from({ length: 240 }, (_, i) => quakeAt(0, at, i));
    const d = diurnal(over(qs), filters, now);
    expect(d.worst).toBeGreaterThan(10);
  });
});

describe("what the radius carries", () => {
  it("is the departure in sigmas, not the count", () => {
    /*
     * Plotted from zero, a month's 4.5 percent variation is under two pixels on a forty pixel bar, so
     * the dial would read as a smooth ring whether the data were flat or carried a ten percent signal.
     */
    expect(departure(510, 500, Math.sqrt(500))).toBeCloseTo(10 / Math.sqrt(500), 9);
    expect(departure(500, 500, Math.sqrt(500))).toBe(0);
  });

  it("clamps, so one freak hour cannot draw off the edge of the dial", () => {
    expect(departure(10_000, 500, Math.sqrt(500))).toBe(3);
    expect(departure(0, 500, Math.sqrt(500))).toBe(-3);
  });

  it("sits at zero when there is no scatter to divide by", () => {
    expect(departure(0, 0, 0)).toBe(0);
    expect(departure(5, 0, Number.NaN)).toBe(0);
  });
});

describe("the dial itself", () => {
  it("puts midnight at the top and noon at the bottom", () => {
    const midnight = dialPoint(0, 10);
    const noon = dialPoint(12, 10);
    expect(midnight.y).toBeLessThan(0);
    expect(noon.y).toBeGreaterThan(0);
    expect(Math.abs(midnight.x)).toBeLessThan(3);
  });

  it("runs clockwise, because a clock does", () => {
    // Six in the morning is to the right of midnight, not to the left.
    expect(dialPoint(6, 10).x).toBeGreaterThan(0);
    expect(dialPoint(18, 10).x).toBeLessThan(0);
  });

  it("draws each hour at its own centre, so the bins are not half a slot out", () => {
    // Hour 0 covers midnight to one, so its mark belongs at half past, a twelfth of a turn along.
    const a = dialPoint(0, 10);
    const expected = (0.5 / BINS) * Math.PI * 2 - Math.PI / 2;
    expect(a.x).toBeCloseTo(Math.cos(expected) * 10, 9);
    expect(a.y).toBeCloseTo(Math.sin(expected) * 10, 9);
  });

  it("keeps every point on its circle", () => {
    for (let h = 0; h < BINS; h += 1) {
      const p = dialPoint(h, 17);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(17, 9);
      expect(Number.isFinite(p.x)).toBe(true);
    }
  });
});
