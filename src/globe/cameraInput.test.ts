import { afterEach, expect, test, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { createControls } from "./controls";

afterEach(() => vi.unstubAllGlobals());

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
