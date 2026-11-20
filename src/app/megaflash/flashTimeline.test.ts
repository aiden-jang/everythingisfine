import { describe, expect, it } from "vitest";
import { flashGeography } from "./flashGlobe";
import {
  BIN,
  DURATION,
  elapsedFor,
  FINAL_STEP,
  FLIGHT_END,
  flashFrame,
  flashTime,
  overview,
  timeAtStep,
  trace,
} from "./flashTimeline";

describe("Megaflash", () => {
  it("plays the published trace in chronological order within the measured duration", () => {
    expect(trace[0]?.[0]).toBe(0);
    expect(trace.at(-1)?.[0]).toBe(7250);
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i]![0]).toBeGreaterThanOrEqual(trace[i - 1]![0]);
    }
  });

  it("banks into the storm and finishes on a level view of the full trace", () => {
    expect(flashFrame(0, false).at).toBeLessThan(0);
    expect(flashFrame(2500, false).camera.roll).not.toBe(0);
    expect(flashFrame(FLIGHT_END, false)).toEqual({ at: DURATION, camera: overview });
    expect(flashFrame(2500, true).camera).toBe(overview);
  });

  it("holds the same optical detections and camera while inspecting time windows", () => {
    const first = flashGeography({ at: 250, camera: overview }, "inspect", false);
    const finish = flashGeography({ at: DURATION, camera: overview }, "inspect", false);
    expect(first.frame.marks).toHaveLength(trace.length);
    expect(finish.frame.marks).toBe(first.frame.marks);
    expect(finish.follow).toBeUndefined();
    expect(first.frame.markWindow).toEqual({ from: 250, to: 500, showAhead: true });
    expect(finish.frame.markWindow).toEqual({ from: 7250, to: DURATION, showAhead: true });
  });

  it("compares just the first quarter-second against the whole flash at the same framing", () => {
    const first = flashGeography(flashFrame(elapsedFor(0), true), "first", false);
    const full = flashGeography({ at: DURATION, camera: overview }, "extent", false);
    expect(first.frame.markWindow).toEqual({ from: 0, to: BIN - 0.001, showAhead: false });
    expect(full.frame.markWindow).toBeUndefined();
    expect(first.frame.marks).toBe(full.frame.marks);
    expect(first.frame.raster).toEqual(full.frame.raster);
    expect(first.follow).toBeUndefined();
    expect(full.follow).toBeUndefined();
  });

  it("lets the keyboard scrub from the pre-flash scan to the published duration", () => {
    expect(flashTime(timeAtStep(-1))).toBe("Before the flash");
    expect(flashTime(timeAtStep(8))).toBe("≈ 2.00 s");
    expect(flashTime(timeAtStep(FINAL_STEP))).toBe("7.39 s");
  });
});
