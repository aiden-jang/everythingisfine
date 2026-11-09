import { expect, test } from "vitest";
import { readStoryMoment, writeStoryMoment } from "./storyMoment";
import { findStories } from "../storyIndex";

test("story links preserve a subsecond sample, city, projection, selection and chapter", () => {
  const moment = {
    id: "megaflash",
    at: 1508662606921,
    city: "São Paulo",
    choice: "station:1",
    chapter: "slice",
    map: true,
  };
  const params = new URLSearchParams();
  writeStoryMoment(params, moment);
  expect(readStoryMoment(params)).toEqual(moment);
  expect(params.get("v")).toBe("observe");
  expect(params.has("play")).toBe(false);
});

test("malformed links cannot select arbitrary modules or nonfinite times", () => {
  expect(readStoryMoment(new URLSearchParams("story=../../secrets"))).toBeUndefined();
  for (const time of ["NaN", "Infinity", "", "9999999999999999"])
    expect(readStoryMoment(new URLSearchParams(`story=fault&t=${time}&choice=%3Cscript%3E`))).toEqual({
      id: "fault",
      map: false,
    });
  expect(readStoryMoment(new URLSearchParams("story=north&t=-2208945600000"))?.at).toBe(-2208945600000);
});

test("story search spans scenes, handles accents, and requires every search term", () => {
  expect(findStories("TOHOKU 2011").map((s) => s.id)).toEqual(["rupture"]);
  expect(findStories("kilauea").map((s) => s.id)).toContain("kilauea");
  expect(findStories("comet").map((s) => s.id)).toContain("comet");
  expect(findStories("California GRACE").map((s) => s.id)).toEqual(["water"]);
  expect(findStories("comet volcano")).toEqual([]);
  expect(findStories("   ")).toEqual([]);
});
