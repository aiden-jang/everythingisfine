import { expect, test } from "vitest";
import { searchStories } from "./storyIndex";
import { browseStories } from "./storyBrowse";
import { firstInvitation, storyOrder } from "./storyCuration";
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
test("the first invitation starts with a recorded investigation", () => {
  const invitation = firstInvitation();
  expect(invitation.id).toBe("float");
  expect(searchStories.some(({ id }) => id === invitation.id)).toBe(true);
  expect(invitation.note).toContain("Recorded");
});
test("each experience has a factual ending, with Float Dive using its measured profile instead", () => {
  expect([...Object.keys(storyFindings), "float"].sort()).toEqual(searchStories.map(({ id }) => id).sort());
  expect(Object.values(storyFindings).every((text) => text.length > 60)).toBe(true);
});
