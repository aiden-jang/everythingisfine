import { describe, expect, it } from "vitest";
import {
  ARRIVAL_MS,
  MODEL_SECONDS,
  REVEAL_MS,
  SHAKING_MS,
  contours,
  faults,
  patchProgress,
  revealFrame,
  stillFrame,
} from "./ruptureModel";

describe("Tōhoku rupture scene", () => {
  it("preserves the modeled patches and the preferred ShakeMap contour range", () => {
    expect(faults).toHaveLength(325);
    expect(
      faults.every(({ corners }) => corners.length === 4 && corners.every(({ depth }) => depth > 0)),
    ).toBe(true);
    expect(MODEL_SECONDS).toBeCloseTo(179.2);
    expect(contours.map(({ mmi }) => mmi)).toEqual(Array.from({ length: 14 }, (_, i) => 1.5 + i / 2));
  });

  it("separates the modeled timing from the shaking map reveal", () => {
    expect(revealFrame(ARRIVAL_MS).modelTime).toBe(0);
    expect(revealFrame(SHAKING_MS - 1)).toMatchObject({ modelTime: MODEL_SECONDS, reveal: 0, depth: 1 });
    expect(revealFrame(REVEAL_MS)).toEqual(stillFrame("shaking"));
    expect(stillFrame("fault")).toMatchObject({ modelTime: MODEL_SECONDS, reveal: 0, depth: 1 });
  });

  it("handles source patches with a zero rise time", () => {
    expect(patchProgress(4, 5, 0)).toBe(0);
    expect(patchProgress(5, 5, 0)).toBe(1);
    expect(patchProgress(6, 5, 2)).toBe(0.5);
  });
});
