import { describe, expect, it } from "vitest";
import {
  DURATION,
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

  it("lets the keyboard scrub from the pre-flash scan to the published duration", () => {
    expect(flashTime(timeAtStep(-1))).toBe("Before the flash");
    expect(flashTime(timeAtStep(8))).toBe("≈ 2.00 s");
    expect(flashTime(timeAtStep(FINAL_STEP))).toBe("7.39 s");
  });
});
