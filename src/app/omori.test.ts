import { describe, expect, it } from "vitest";
import {
  expectedFraction, MIN_AFTER, observed, OMORI_C_MS, OMORI_P, reference, staircase,
} from "./omori";

const HOUR = 3_600_000;

/*
 * The law is drawn as a reference and never fitted, so what is worth testing is the shape it claims
 * and the arithmetic that scales it, not a goodness of fit that this deliberately does not compute.
 */

describe("what actually happened", () => {
  it("counts only what followed, since decay is not a thing that precedes an event", () => {
    const seq = [{ at: -2 * HOUR }, { at: -HOUR }, { at: HOUR }, { at: 3 * HOUR }];
    expect(observed(seq)).toEqual([{ at: HOUR, n: 1 }, { at: 3 * HOUR, n: 2 }]);
  });

  it("climbs by one per event, in time order whatever order it arrived in", () => {
    // The store hands events back in arrival order, which is not origin order.
    const seq = [{ at: 5 * HOUR }, { at: HOUR }, { at: 3 * HOUR }];
    expect(observed(seq).map((p) => p.n)).toEqual([1, 2, 3]);
    expect(observed(seq).map((p) => p.at)).toEqual([HOUR, 3 * HOUR, 5 * HOUR]);
  });

  it("excludes the pinned event itself, which is the origin and not an aftershock of itself", () => {
    expect(observed([{ at: 0 }, { at: HOUR }])).toEqual([{ at: HOUR, n: 1 }]);
  });

  it("has nothing to draw for an event with nothing after it", () => {
    expect(observed([{ at: -HOUR }])).toEqual([]);
    expect(observed([])).toEqual([]);
  });
});

describe("the law", () => {
  it("is quoted at its textbook exponent rather than fitted", () => {
    // The moment this becomes a free parameter it stops being a reference and starts being a claim.
    expect(OMORI_P).toBe(1);
    expect(OMORI_C_MS).toBe(6 * 60_000);
  });

  it("finishes exactly on the observed total, so the comparison is of shape", () => {
    const curve = reference(12 * HOUR, 40);
    expect(curve[0]).toEqual({ at: 0, n: 0 });
    expect(curve[curve.length - 1]!.at).toBe(12 * HOUR);
    expect(curve[curve.length - 1]!.n).toBeCloseTo(40, 9);
  });

  it("front-loads hard, which is the whole reason it is distinguishable from a straight line", () => {
    /*
     * The number that decided this was worth drawing, computed before it was drawn. Over twelve hours
     * with c at six minutes the law is 86 percent done by the halfway mark, against 50 for linear. In
     * a 28 pixel plot that is ten pixels of separation.
     */
    const half = expectedFraction(12 * HOUR, 6 * HOUR);
    expect(half).toBeCloseTo(0.857, 3);
    expect(half - 0.5).toBeGreaterThan(0.3);
  });

  it("stays distinguishable at a short span too, where the curve is gentler", () => {
    // Two hours is the tight end of anything the panel will show, and it still departs by a third.
    expect(expectedFraction(2 * HOUR, HOUR) - 0.5).toBeGreaterThan(0.25);
  });

  it("rises monotonically, so the drawn line cannot double back", () => {
    const curve = reference(9 * HOUR, 25);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]!.n).toBeGreaterThanOrEqual(curve[i - 1]!.n);
      expect(curve[i]!.at).toBeGreaterThan(curve[i - 1]!.at);
    }
  });

  it("refuses the degenerate cases rather than dividing by them", () => {
    expect(reference(0, 10)).toEqual([]);
    expect(reference(-HOUR, 10)).toEqual([]);
    expect(reference(HOUR, 0)).toEqual([]);
    expect(expectedFraction(0, 0)).toBe(0);
  });

  it("clamps a negative offset rather than taking the log of a negative", () => {
    // Nothing should ask for this, and `Math.log` of a negative is NaN, which would silently poison
    // an entire polyline rather than one point of it.
    expect(Number.isFinite(expectedFraction(HOUR, -HOUR))).toBe(true);
    expect(expectedFraction(HOUR, -HOUR)).toBe(0);
  });

  it("asks for enough events to have a shape at all", () => {
    expect(MIN_AFTER).toBeGreaterThanOrEqual(8);
  });
});

describe("the staircase", () => {
  const HR = 3_600_000;

  it("starts at the mainshock, not at the first aftershock", () => {
    // Otherwise the line opens partway across the plot with nothing saying where the count came from.
    expect(staircase([{ at: HR, n: 1 }])[0]).toEqual({ at: 0, n: 0 });
  });

  it("steps rather than slopes, so it never claims an arrival between arrivals", () => {
    const steps = staircase([{ at: HR, n: 1 }, { at: 3 * HR, n: 2 }]);
    expect(steps).toEqual([
      { at: 0, n: 0 },
      { at: HR, n: 0 },
      { at: HR, n: 1 },
      { at: 3 * HR, n: 1 },
      { at: 3 * HR, n: 2 },
    ]);
  });

  it("is two points per arrival plus the origin", () => {
    const after = Array.from({ length: 9 }, (_, i) => ({ at: (i + 1) * HR, n: i + 1 }));
    expect(staircase(after)).toHaveLength(9 * 2 + 1);
  });

  it("never goes backwards in time or down in count", () => {
    const after = Array.from({ length: 12 }, (_, i) => ({ at: (i + 1) * HR, n: i + 1 }));
    const steps = staircase(after);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!.at).toBeGreaterThanOrEqual(steps[i - 1]!.at);
      expect(steps[i]!.n).toBeGreaterThanOrEqual(steps[i - 1]!.n);
    }
  });

  it("draws nothing from nothing", () => {
    expect(staircase([])).toEqual([]);
  });

  it("produces only finite coordinates, which a polyline needs to render at all", () => {
    /*
     * One NaN in a `points` string voids the whole polyline rather than one vertex of it, so this is
     * the assertion that stands in for looking at the plot.
     */
    const after = observed([{ at: -HR }, { at: HR }, { at: 2 * HR }, { at: 9 * HR }]);
    for (const p of [...staircase(after), ...reference(9 * HR, after.length)]) {
      expect(Number.isFinite(p.at)).toBe(true);
      expect(Number.isFinite(p.n)).toBe(true);
    }
  });
});
