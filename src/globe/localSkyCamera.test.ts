import { PerspectiveCamera } from "three";
import { expect, test, vi } from "vitest";
import type { TonightView } from "../geo/tonight";
import { createLocalSkyCamera } from "./localSkyCamera";

const sky: TonightView = {
  kind: "tonight",
  at: 0,
  city: { name: "London", lon: -0.1276, lat: 51.5072, zone: "Europe/London" },
  look: { azimuth: 107, altitude: 44 },
  bodies: [],
  sunCover: 0.419,
};

test("an eclipse approach follows an arc and lands on time even when the orbit has not settled", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  try {
    const camera = new PerspectiveCamera(45);
    camera.position.set(0, 0, -3);
    const fly = vi.fn();
    const horizon = createLocalSkyCamera(camera, () => ({ lon: 180, lat: 0, zoom: 1 }), fly);
    horizon.set(sky, false);
    horizon.step(0, false, false);
    expect(fly).toHaveBeenCalledOnce();
    expect(horizon.ready()).toBe(false);

    clock.mockReturnValue(650);
    horizon.step(0.016, false, false);
    horizon.apply();
    expect(camera.position.length()).toBeGreaterThan(1.012);
    expect(camera.position.x).not.toBe(0);
    expect(horizon.ready()).toBe(false);

    horizon.set({ ...sky, at: 2 }, false);
    clock.mockReturnValue(1200);
    horizon.step(0.016, false, false);
    horizon.apply();
    expect(horizon.ready()).toBe(true);
    expect(camera.fov).toBe(64);
    expect(camera.position.length()).toBeCloseTo(1.012, 6);
    expect(fly).toHaveBeenCalledOnce();

    const firstCity = camera.position.clone();
    const nextCity = { name: "Luxor", lon: 32.6396, lat: 25.6872, zone: "Africa/Cairo" };
    horizon.set({ ...sky, city: nextCity }, false);
    clock.mockReturnValue(1460);
    horizon.step(0.016, false, false);
    horizon.apply();
    expect(camera.position.distanceTo(firstCity)).toBeGreaterThan(0.05);
    expect(camera.position.length()).toBeGreaterThan(1.012);
    expect(horizon.ready()).toBe(false);
  } finally {
    clock.mockRestore();
  }
});
