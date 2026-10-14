import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { createControls } from "./controls";
import { animationDelta } from "./animation";

afterEach(() => vi.unstubAllGlobals());

describe("camera motion on slow displays", () => {
  function flight(frameSeconds: number) {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const controls = createControls(new PerspectiveCamera(), {} as HTMLCanvasElement, { lon: 0, lat: 0 }, 45);
    controls.flyTo(100, 40, 2);
    for (let elapsed = 0; elapsed < 2; elapsed += frameSeconds) controls.step(animationDelta(frameSeconds));
    return controls.state();
  }

  it("reaches the same destination at 5 fps and 60 fps", () => {
    const smooth = flight(1 / 60);
    const slow = flight(1 / 5);
    expect(slow.lon).toBeCloseTo(smooth.lon, 2);
    expect(slow.lat).toBeCloseTo(smooth.lat, 2);
    expect(slow.zoom).toBeCloseTo(smooth.zoom, 2);
    expect(slow.lon).toBeCloseTo(100, 2);
  });

  it("bounds a resumed tab's first step without destabilizing the flight", () => {
    expect(animationDelta(30)).toBe(0.25);
    const state = flight(0.25);
    expect(state.lon).toBeCloseTo(100, 2);
    expect(state.lat).toBeCloseTo(40, 2);
    expect(state.zoom).toBeCloseTo(2, 2);
  });
});
