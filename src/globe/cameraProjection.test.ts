import { PerspectiveCamera, Vector3 } from "three";
import { expect, it } from "vitest";
import { toVec3 } from "../geo/sphere";
import { createUnfoldCamera } from "./cameraProjection";
import { unfoldPoint } from "./morph";

it("keeps the geographic aim centered without jumping on the first frame", () => {
  const camera = new PerspectiveCamera(46, 1.4, 0.01, 100);
  const view = createUnfoldCamera(camera);
  const lon = -49.643;
  const lat = 59.915;
  const distance = 3.2;
  const initial = new Vector3(...toVec3(lon, lat, distance));

  view.place(lon, lat, distance, 0.00001);
  expect(camera.position.distanceTo(initial)).toBeLessThan(0.001);

  for (const t of [0.01, 0.2, 0.5, 0.8, 0.99, 1]) {
    view.place(lon, lat, distance, t);
    camera.updateMatrixWorld();
    const screen = unfoldPoint(new Vector3(), lon, lat, t).project(camera);
    expect(screen.x).toBeCloseTo(0, 7);
    expect(screen.y).toBeCloseTo(0, 7);
  }
});
