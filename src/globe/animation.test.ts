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

  it("steering and a map interrupt arrival at the displayed pose", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      addEventListener: (type: string, callback: (event: unknown) => void) => listeners.set(type, callback),
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", { activeElement: null });
    const canvas = {
      clientWidth: 800,
      clientHeight: 600,
      addEventListener: (type: string, callback: (event: unknown) => void) => listeners.set(type, callback),
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    } as unknown as HTMLCanvasElement;
    const controls = createControls(new PerspectiveCamera(), canvas, { lon: 145, lat: 12 }, 45);
    controls.enter();
    const from = controls.state();
    const detach = controls.attach(() => {});
    listeners.get("wheel")!({ deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} });
    for (let i = 0; i < 180; i++) controls.step(1 / 60);
    expect(controls.state().zoom).toBeGreaterThan(from.zoom);
    expect(Math.abs(controls.state().lon - from.lon)).toBeLessThan(1);
    controls.flyTo(145, 12, 1);
    controls.enter();
    const beforeKey = controls.state();
    listeners.get("keydown")!({ key: "ArrowRight", preventDefault: () => {} });
    for (let i = 0; i < 180; i++) controls.step(1 / 60);
    expect(controls.state().lon).toBe(beforeKey.lon + 8);
    controls.flyTo(145, 12, 1);
    controls.enter();
    const beforeMap = controls.state();
    controls.setMorph(1);
    for (let i = 0; i < 180; i++) controls.step(1 / 60);
    expect(controls.state().lon).toBe(beforeMap.lon);
    expect(controls.state().lat).toBe(beforeMap.lat);
    detach();
  });

  it("bounds a resumed tab's first step without destabilizing the flight", () => {
    expect(animationDelta(30)).toBe(0.25);
    const state = flight(0.25);
    expect(state.lon).toBeCloseTo(100, 2);
    expect(state.lat).toBeCloseTo(40, 2);
    expect(state.zoom).toBeCloseTo(2, 2);
  });
});
