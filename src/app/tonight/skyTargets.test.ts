import { expect, test } from "vitest";
import { skyTargets } from "./skyTargets";

test("the invitation prefers a bright target clear of the horizon and leads the observing list with it", () => {
  const bodies = [
    { name: "Moon", altitude: -4, azimuth: 90, magnitude: -12, lit: 40 },
    { name: "Jupiter", altitude: 2, azimuth: 120, magnitude: -2, lit: null },
    { name: "Saturn", altitude: 30, azimuth: 170, magnitude: 0, lit: null },
    { name: "Mars", altitude: 40, azimuth: 200, magnitude: 1, lit: null },
  ];
  const result = skyTargets(bodies);
  expect(result.target?.name).toBe("Saturn");
  expect(result.visible.map(({ name }) => name)).toEqual(["Saturn", "Jupiter", "Mars"]);
  expect(result.below.map(({ name }) => name)).toEqual(["Moon"]);
  expect(bodies[0]?.name).toBe("Moon");
});

test("a near-horizon object remains findable when no higher target is available", () => {
  const result = skyTargets([
    { name: "Moon", altitude: 0, azimuth: 90, magnitude: -12, lit: 40 },
    { name: "Saturn", altitude: 3, azimuth: 170, magnitude: 0, lit: null },
  ]);
  expect(result.target?.name).toBe("Saturn");
  expect(result.visible).toHaveLength(1);
  expect(result.below).toHaveLength(1);
});

test("the invitation offers no invented target when all bodies are below the horizon", () => {
  const result = skyTargets([{ name: "Moon", altitude: -4, azimuth: 90, magnitude: -12, lit: 40 }]);
  expect(result.target).toBeUndefined();
  expect(result.visible).toEqual([]);
  expect(result.below).toHaveLength(1);
});
