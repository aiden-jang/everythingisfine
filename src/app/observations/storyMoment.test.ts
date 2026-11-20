import { expect, test } from "vitest";
import { readStoryMoment, writeStoryMoment } from "./storyMoment";
import { findStories, searchStories } from "../storyIndex";

test("every story has a unique address across catalogues", () => {
  const ids = searchStories.map(({ id }) => id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  expect(findStories("River Pulse").map(({ id }) => id)).toEqual(["river"]);
  expect(findStories("Atmospheric River").map(({ id }) => id)).toEqual(["atmospheric-river"]);
  for (const id of ["river", "atmospheric-river"])
    expect(readStoryMoment(new URLSearchParams({ story: id }))?.id).toBe(id);
});

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
  expect(findStories("moon landing").map((story) => story.id)).toContain("moonfall");
  expect(findStories("underwater").map((story) => story.id)).toContain("float");
  expect(findStories("comet volcano")).toEqual([]);
  expect(findStories("   ")).toEqual([]);
});

test("sky links round trip a night path and rover links reject invalid stops", () => {
  const sky = {
    city: "Tokyo",
    at: 1794002400000,
    look: { azimuth: 180, altitude: 16 },
    nightStart: 1793964000000,
    target: "Saturn",
    trail: true,
    following: false,
    orbit: true,
  };
  const moment = { id: "sky", city: sky.city, at: sky.at, map: false, sky };
  const params = new URLSearchParams();
  writeStoryMoment(params, moment);
  expect(readStoryMoment(params)).toEqual(moment);
  params.set("story", "moonfall");
  params.set("rover", "1,0,999");
  expect(readStoryMoment(params)?.sky?.lunar).toBeUndefined();
  params.set("look", ",16");
  expect(readStoryMoment(params)?.sky).toBeUndefined();
});
