import { expect, test } from "vitest";
import { storyMapTarget } from "./mapFraming";
import type { EarthStoryData } from "./types";
const base: EarthStoryData = { target: { lon: 180, lat: 0, zoom: 1 }, frames: [], chapters: [] };
test("map framing includes the full route, including a bend away from its endpoints", () => {
  const target = storyMapTarget({
    ...base,
    target: { lon: 0, lat: 0, zoom: 1 },
    frames: [
      {
        at: 0,
        caption: "",
        paths: [
          {
            points: [
              { lon: -10, lat: 0 },
              { lon: 10, lat: 60 },
              { lon: 20, lat: 0 },
            ],
          },
        ],
      },
    ],
  });
  expect(target).toEqual({ lon: 5, lat: 30, zoom: 160 / 108 });
});
test("a route crossing the date line stays centered on the Pacific", () => {
  const target = storyMapTarget({
    ...base,
    frames: [
      {
        at: 0,
        caption: "",
        paths: [
          {
            points: [
              { lon: 170, lat: 5 },
              { lon: -175, lat: -5 },
            ],
          },
        ],
      },
    ],
  });
  expect(target.lon).toBe(177.5);
  expect(target.zoom).toBe(2.6);
});
test("authored map shots and scientific projection lenses retain their framing", () => {
  const mapTarget = { lon: 140, lat: 30, zoom: 2 };
  expect(storyMapTarget({ ...base, mapTarget })).toBe(mapTarget);
  expect(storyMapTarget({ ...base, lens: { globe: 0.1, map: 0.1 } })).toBe(base.target);
  expect(storyMapTarget({ ...base, frames: [{ at: 0, caption: "", reconstruction: true }] })).toBe(
    base.target,
  );
  expect(storyMapTarget(base)).toBe(base.target);
});
