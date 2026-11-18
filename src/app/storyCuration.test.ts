import { expect, test } from "vitest";
import { searchStories } from "./storyIndex";
import { browseStories } from "./storyBrowse";
import { featuredStories, storyOrder } from "./storyCuration";
import { storyFindings } from "./journeys/findings";

test("the editorial order preserves every experience once, with cross-scene highlights", () => {
  expect([...storyOrder].sort()).toEqual(searchStories.map(({ id }) => id).sort());
  expect(new Set(storyOrder).size).toBe(storyOrder.length);
  expect(
    browseStories(null, true)
      .slice(0, 3)
      .map(({ id }) => id),
  ).toEqual(["moonfall", "rupture", "katrina"]);
  expect(new Set(browseStories(null, false).map(({ scene }) => scene)).size).toBe(3);
});
test("the story catalogue opens with a measured investigation", () => {
  expect(featuredStories.live.id).toBe("float");
  expect(searchStories.some(({ id }) => id === featuredStories.live.id)).toBe(true);
  expect(featuredStories.live.note).toContain("Argo");
});
test("each experience has a factual ending, with Float Dive using its measured profile instead", () => {
  expect([...Object.keys(storyFindings), "float"].sort()).toEqual(searchStories.map(({ id }) => id).sort());
  expect(Object.values(storyFindings).every((text) => text.length > 60)).toBe(true);
});
