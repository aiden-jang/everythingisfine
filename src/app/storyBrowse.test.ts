import { describe, expect, it } from "vitest";
import { browseStories, featuredIds, storyKind } from "./storyBrowse";
import { findStories, searchStories } from "./storyIndex";

describe("story browsing", () => {
  for (const scene of [null, "live", "depth", "night"] as const) {
    it(`keeps ${scene ?? "all scenes"} short while preserving the full catalogue`, () => {
      const first = browseStories(scene, false);
      const all = browseStories(scene, true);
      const featured = featuredIds[scene ?? "live"];
      expect(first.length).toBeGreaterThan(0);
      expect(first.length).toBeLessThanOrEqual(6);
      expect(new Set([...all.map(({ id }) => id), featured]).size).toBe(all.length + 1);
      expect([...all.map(({ id }) => id), featured].sort()).toEqual(
        searchStories
          .filter((story) => !scene || story.scene === scene)
          .map(({ id }) => id)
          .sort(),
      );
      expect(first.every((story) => all.includes(story))).toBe(true);
    });
  }
  it("distinguishes forecasts, recent observations and recorded journeys", () => {
    expect(storyKind("atmospheric-river")).toBe("Forecast");
    expect(storyKind("wind")).toBe("Forecast");
    expect(storyKind("reef")).toBe("Recent observations");
    expect(storyKind("radar")).toBe("Recent observations");
    expect(storyKind("shadow")).toBe("Prediction");
    expect(storyKind("katrina")).toBe("Recorded story");
    expect(storyKind("deep")).toBe("Reconstruction");
  });
});

it("keeps subject search inside the chosen scene while allowing the full catalogue", () => {
  expect(findStories("Aral", "night")).toEqual([]);
  expect(findStories("Aral", "live").map(({ id }) => id)).toContain("aral");
  expect(findStories("Aral", null).map(({ id }) => id)).toContain("aral");
  expect(findStories("Moonfall", "live")).toEqual([]);
  expect(findStories("Moonfall", "night").map(({ id }) => id)).toContain("moonfall");
});
