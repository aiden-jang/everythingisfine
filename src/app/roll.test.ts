import { describe, expect, it } from "vitest";
import { ROLL_TAU_MS, shouldRoll, stepToward } from "./roll";

describe("closing the gap", () => {
  it("moves most of the way in a time constant", () => {
    // 1 - 1/e of the distance, which is what makes the same number work for one and for ten thousand.
    expect(stepToward(0, 1000, ROLL_TAU_MS)).toBeCloseTo(1000 * (1 - Math.exp(-1)), 6);
  });

  it("is tuned by solving for the landing time, not by taste", () => {
    /*
     * Time to land is tau * ln(gap / 0.5). The largest change the app makes is 872 to 11,363 when the
     * window widens, which is about ten time constants, so the constant is that budget divided by ten.
     * This is the assertion that stops it drifting back to a number that feels right and measures wrong.
     */
    expect(ROLL_TAU_MS * Math.log(10_491 / 0.5)).toBeLessThan(700);
    expect(ROLL_TAU_MS * Math.log(1 / 0.5)).toBeLessThan(60);
  });

  it("lands a single arrival almost at once and a window change in about half a second", () => {
    /*
     * The reason the rate is a time constant rather than a duration: these two differ by four orders of
     * magnitude and a fixed duration either crawls through the first or blurs the second.
     */
    let one = 872;
    let ms = 0;
    while (one !== 873 && ms < 2000) { one = stepToward(one, 873, 16); ms += 16; }
    expect(ms).toBeLessThan(120);

    let many = 872;
    ms = 0;
    while (many !== 11_363 && ms < 5000) { many = stepToward(many, 11_363, 16); ms += 16; }
    // Long enough to read as counting, short enough not to be a readout arguing with itself. The first
    // time constant tried measured 1,194ms here, which was the second of turning digits that found it.
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(700);
  });

  it("arrives rather than easing forever", () => {
    // An exponential never formally lands, and 872.7 renders as 873 while keeping a frame loop awake.
    // Inside half a unit, which is where the rendered digits have already stopped changing.
    expect(stepToward(872.7, 873, 1)).toBe(873);
    expect(stepToward(1000, 1000, 16)).toBe(1000);
  });

  it("lands exactly when a backgrounded tab wakes with half a second in hand", () => {
    expect(stepToward(0, 500, 5000)).toBe(500);
  });

  it("goes down as readily as up", () => {
    expect(stepToward(11_363, 872, 16)).toBeLessThan(11_363);
    expect(stepToward(11_363, 872, 16)).toBeGreaterThan(872);
  });

  it("takes a target it cannot reason about rather than propagating a NaN", () => {
    expect(stepToward(Number.NaN, 500, 16)).toBe(500);
  });

  it("treats a negative frame time as no time at all", () => {
    // Clocks do go backwards, and a negative dt would run the approach in reverse.
    expect(stepToward(0, 100, -50)).toBe(0);
  });
});

describe("whether to roll at all", () => {
  it("does not roll the first value it ever sees", () => {
    // Easing up from zero on load invents a count-up the data never did, and the entrance replay
    // already owns that moment.
    expect(shouldRoll(null, false)).toBe(false);
  });

  it("skips entirely under reduced motion rather than shortening", () => {
    // The rule the camera and the entrance both follow: a brief version of a motion somebody asked not
    // to see is still the motion.
    expect(shouldRoll(872, true)).toBe(false);
  });

  it("rolls an ordinary change", () => {
    expect(shouldRoll(872, false)).toBe(true);
  });
});
