import { describe, expect, it, vi } from "vitest";
import { createLandingRotation } from "./landingRotation";

function camera() {
  let pose = { lon: 145, lat: 12, zoom: 1 };
  return {
    state: () => pose,
    setView: vi.fn((next: typeof pose) => {
      pose = next;
    }),
  };
}

describe("landing rotation", () => {
  it("eases into a slow orbit without changing latitude or zoom", () => {
    const view = camera(),
      step = createLandingRotation();
    step(view, 0.1, true, false);
    const first = view.state().lon - 145;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.03);
    for (let i = 0; i < 99; i++) step(view, 0.1, true, false);
    expect(view.state()).toEqual({ lon: expect.closeTo(160.2, 4), lat: 12, zoom: 1 });
  });

  it("integrates the same travel at different frame rates", () => {
    const travel = (hz: number) => {
      const view = camera(),
        step = createLandingRotation();
      for (let i = 0; i < hz * 10; i++) step(view, 1 / hz, true, false);
      return view.state().lon;
    };
    expect(travel(30)).toBeCloseTo(travel(120), 8);
  });

  it("yields to flights and disabled motion, then eases in again", () => {
    const view = camera(),
      step = createLandingRotation();
    for (let i = 0; i < 30; i++) step(view, 0.1, true, false);
    view.setView.mockClear();
    expect(step(view, 0.1, true, true)).toBe(false);
    expect(step(view, 0.1, false, false)).toBe(false);
    expect(view.setView).not.toHaveBeenCalled();
    const before = view.state().lon;
    step(view, 0.1, true, false);
    expect(view.state().lon - before).toBeLessThan(0.03);
  });

  it("does not catch up after a long pause or change a zero-duration frame", () => {
    const view = camera(),
      step = createLandingRotation();
    expect(step(view, 0, true, false)).toBe(true);
    expect(view.setView).not.toHaveBeenCalled();
    step(view, 60, true, false);
    expect(view.state().lon - 145).toBeGreaterThan(0);
    expect(view.state().lon - 145).toBeLessThan(0.03);
  });
});
