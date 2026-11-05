import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { MAP_HALF_WIDTH, unfoldPoint, visibleCopies } from "./morph";

it("opens the seam on a curved sheet and reaches the same map coordinates continuously", () => {
  const west = new Vector3();
  const east = new Vector3();
  const middle = new Vector3();
  expect(unfoldPoint(east, 180, 0, 0).distanceTo(unfoldPoint(west, -180, 0, 0))).toBeLessThan(1e-10);
  unfoldPoint(west, -180, 0, 0.5);
  unfoldPoint(east, 180, 0, 0.5);
  unfoldPoint(middle, 0, 0, 0.5);
  expect(east.x).toBeGreaterThan(1);
  expect(west.x).toBeCloseTo(-east.x);
  expect(middle.z - east.z).toBeGreaterThan(1);
  for (const [lon, lat] of [
    [180, 88],
    [-179.5, -89],
    [145, 12],
    [0, 0],
  ] as const) {
    expect(unfoldPoint(east, lon, lat, 1 - 1e-7).distanceTo(unfoldPoint(west, lon, lat, 1))).toBeLessThan(
      1e-6,
    );
  }
  expect(unfoldPoint(east, 180, 0, 1).x).toBe(MAP_HALF_WIDTH);
});

/*
 * The flat map repeats by being drawn again, so this decides how many passes a frame costs and, more
 * importantly, whether an edge of the screen gets a copy at all. The failure mode is a strip of void
 * at one side that reads as the end of the world rather than as a missing draw call.
 */
describe("which copies of the map are on screen", () => {
  const period = 2 * MAP_HALF_WIDTH;
  /** Does every point the camera can see fall inside some drawn copy? */
  const covers = (cameraX: number, halfWidth: number): boolean => {
    const { first, last } = visibleCopies(cameraX, halfWidth);
    const left = Math.min(
      ...Array.from({ length: last - first + 1 }, (_, i) => (first + i) * period - MAP_HALF_WIDTH),
    );
    const right = Math.max(
      ...Array.from({ length: last - first + 1 }, (_, i) => (first + i) * period + MAP_HALF_WIDTH),
    );
    return left <= cameraX - halfWidth && right >= cameraX + halfWidth;
  };

  it("covers the view wherever the camera is and however wide it sees", () => {
    for (let x = -30; x <= 30; x += 0.37) {
      for (const halfWidth of [0.2, 1, 1.9, 2.5, 4]) {
        expect(covers(x, halfWidth), `x=${x.toFixed(2)} halfWidth=${halfWidth}`).toBe(true);
      }
    }
  });

  it("draws one copy when zoomed inside a single world", () => {
    const { first, last } = visibleCopies(0, 0.3);
    expect(last - first).toBe(0);
  });

  it("draws a neighbour as soon as the view crosses an edge", () => {
    // Camera near the right edge of copy zero, seeing past it.
    const { first, last } = visibleCopies(MAP_HALF_WIDTH - 0.1, 0.5);
    expect(last - first).toBe(1);
  });

  it("never asks for more copies than the view can hold", () => {
    const { first, last } = visibleCopies(0, 2 * MAP_HALF_WIDTH);
    expect(last - first).toBeLessThanOrEqual(3);
  });
});
