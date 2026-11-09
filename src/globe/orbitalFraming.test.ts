import { expect, test } from "vitest";
import { PerspectiveCamera } from "three";
import { createOrbitalFraming } from "./orbitalFraming";

test("non-orbital and flat-map cameras retain the geographic look target", () => {
  const camera = new PerspectiveCamera(32, 1.4, 0.1, 100);
  const reset = () => {
    camera.position.set(1.6, 0.3, 2);
    camera.lookAt(1.6, 0.3, 0);
  };
  reset();
  const expected = camera.quaternion.clone();
  const framing = createOrbitalFraming();
  framing.set(undefined);
  framing.apply(camera, 1, reset);
  expect(camera.quaternion.equals(expected)).toBe(true);
  framing.set({ focus: [10, 20, 30], distance: 12 });
  framing.step(1, true);
  framing.apply(camera, 1, reset);
  expect(camera.position.toArray()).toEqual([1.6, 0.3, 2]);
  expect(camera.quaternion.equals(expected)).toBe(true);
  framing.apply(camera, 0, reset);
  expect(camera.far).toBe(2000);
  framing.set(undefined);
  framing.step(1, true);
  framing.apply(camera, 1, reset);
  expect(camera.far).toBe(100);
  expect(camera.quaternion.equals(expected)).toBe(true);
});
