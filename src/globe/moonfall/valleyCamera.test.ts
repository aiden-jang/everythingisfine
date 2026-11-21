import { expect, test } from "vitest";
import { Vector3 } from "three";
import { createValleyCamera } from "./valleyCamera";

test.each([0.7, 1.2, 2.5])("the selected stop holds its screen position at aspect %s", (aspect) => {
  const frame = createValleyCamera();
  const stop = new Vector3(-5.5, 1.2, 1.8);
  const projected = (overhead: number, point: Vector3) => {
    const relief = 1 - overhead * 0.98;
    const camera = frame(aspect, overhead, relief, 1, stop);
    camera.updateMatrixWorld();
    return point
      .clone()
      .multiply(new Vector3(1, relief, 1))
      .project(camera);
  };
  const terrain = projected(0, stop);
  for (const overhead of [0.25, 0.5, 0.75, 1]) {
    const next = projected(overhead, stop);
    expect(next.x).toBeCloseTo(terrain.x, 7);
    expect(next.y).toBeCloseTo(terrain.y, 7);
    expect(Math.abs(next.z)).toBeLessThan(1);
  }

  const ridge = new Vector3(-3.2, 2.65, -2);
  const terrainRidge = projected(0, ridge);
  const mapRidge = projected(1, ridge);
  const middle = projected(0.5, ridge);
  expect(middle.distanceTo(terrainRidge)).toBeGreaterThan(0.01);
  expect(middle.distanceTo(mapRidge)).toBeGreaterThan(0.01);
});
