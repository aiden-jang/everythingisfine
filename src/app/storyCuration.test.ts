import { expect, test } from "vitest";
import { searchStories } from "./storyIndex";
import { browseStories } from "./storyBrowse";
import { firstInvitation, storyOrder } from "./storyCuration";
import { storyFindings } from "./journeys/findings";

const now = 1_800_000_000_000;
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
test("the first invitation uses a current source and falls back without claiming live data", () => {
  const base = { now, auroraAvailable: false };
  expect(firstInvitation({ ...base, radarAt: now - 600_000 }).id).toBe("radar");
  expect(firstInvitation({ ...base, radarAt: now + 1 }).id).toBe("float");
  expect(firstInvitation({ ...base, radarAt: now - 1_800_000 }).id).toBe("float");
  expect(firstInvitation({ ...base, auroraAvailable: true, auroraAt: now + 60_000 }).id).toBe("aurora");
  expect(firstInvitation(base).note).toContain("Recorded");
});
test("each experience has a factual ending, with Float Dive using its measured profile instead", () => {
  expect([...Object.keys(storyFindings), "float"].sort()).toEqual(searchStories.map(({ id }) => id).sort());
  expect(Object.values(storyFindings).every((text) => text.length > 60)).toBe(true);
});
