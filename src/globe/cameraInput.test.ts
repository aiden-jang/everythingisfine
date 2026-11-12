import { afterEach, expect, test, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { createControls } from "./controls";

afterEach(() => vi.unstubAllGlobals());

test("dragging at maximum zoom stays finite throughout the globe-to-map transition", () => {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    removeEventListener() {},
  });
  const surface = Object.assign(new EventTarget(), {
    clientWidth: 1000,
    clientHeight: 625,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 625 }),
  });
  for (const morph of [0, 0.1, 0.35, 0.49, 0.51, 0.8, 1]) {
    const camera = new PerspectiveCamera(32, 1.6);
    const controls = createControls(
      camera,
      surface as unknown as HTMLCanvasElement,
      { lon: 30, lat: 20 },
      32,
    );
    controls.setFit(4, 4);
    controls.flyTo(30, 20, 12);
    controls.setMorph(morph);
    const detach = controls.attach(() => {});
    for (const [type, x, y] of [
      ["pointerdown", 700, 250],
      ["pointermove", 710, 254],
      ["pointerup", 710, 254],
    ] as const)
      surface.dispatchEvent(
        Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: x, clientY: y }),
      );
    const after = controls.state();
    expect(Object.values(after).every(Number.isFinite), `camera at morph ${morph}`).toBe(true);
    expect(after.lon).toBeLessThan(30);
    expect(after.lat).toBeGreaterThan(20);
    expect(after.zoom).toBe(12);
    detach();
  }
});

test("successive wheel events keep the same map point anchored while the camera eases", () => {
  const preference = { matches: true };
  vi.stubGlobal("window", {
    matchMedia: () => preference,
    addEventListener() {},
    removeEventListener() {},
  });
  const surface = Object.assign(new EventTarget(), {
    clientWidth: 1000,
    clientHeight: 625,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 625 }),
  });
  const camera = new PerspectiveCamera(32, 1.6);
  const controls = createControls(camera, surface as unknown as HTMLCanvasElement, { lon: 0, lat: 30 }, 32);
  controls.setFit(4, 4);
  controls.setMorph(1);
  controls.flyTo(0, 30, 1);
  controls.apply();
  const anchor = controls.pick(700, 250)!;
  const detach = controls.attach(() => {});
  preference.matches = false;
  for (let i = 0; i < 16; i++) {
    surface.dispatchEvent(
      Object.assign(new Event("wheel", { cancelable: true }), {
        deltaY: -25,
        clientX: 700,
        clientY: 250,
      }),
    );
    controls.step(1 / 120);
    controls.apply();
  }
  for (let i = 0; i < 600; i++) {
    controls.step(1 / 60);
    controls.apply();
  }
  const result = controls.project(anchor.lon, anchor.lat)!;
  expect(result.x).toBeCloseTo(700, 1);
  expect(result.y).toBeCloseTo(250, 1);
  expect(controls.state().zoom).toBeCloseTo(Math.exp(16 * 25 * 0.0011), 2);
  detach();
});
