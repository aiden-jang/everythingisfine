import { expect, test } from "vitest";
import { searchStories } from "./storyIndex";
import { browseStories, featuredStoryId } from "./storyBrowse";
import { featuredStories, storyOrder } from "./storyCuration";
import { storyFindings } from "./journeys/findings";

test("the editorial order preserves every experience once, with cross-scene highlights", () => {
  expect([...storyOrder].sort()).toEqual(searchStories.map(({ id }) => id).sort());
  expect(new Set(storyOrder).size).toBe(storyOrder.length);
  expect(
    browseStories(null, true)
      .slice(0, 3)
      .map(({ id }) => id),
  ).toEqual(["float", "moonfall", "rupture"]);
  expect(new Set(browseStories(null, false).map(({ scene }) => scene))).toEqual(
    new Set(["live", "night", "depth"]),
  );
});
test("the catalogue and Earth feature lead with measured investigations", () => {
  expect(featuredStoryId(null)).toBe("tonga");
  expect(featuredStories.live.id).toBe("float");
  expect(searchStories.some(({ id }) => id === featuredStories.live.id)).toBe(true);
  expect(featuredStories.live.note).toContain("Argo");
});
test("each experience has a factual ending, with Float Dive using its measured profile instead", () => {
  expect([...Object.keys(storyFindings), "float"].sort()).toEqual(searchStories.map(({ id }) => id).sort());
  expect(Object.values(storyFindings).every((text) => text.length > 60)).toBe(true);
});
