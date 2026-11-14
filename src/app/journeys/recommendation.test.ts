import { expect, it } from "vitest";
import { recommendStory } from "./recommendation";
import { searchStories } from "../storyIndex";
const seen = (id: string, at = 1000) => ({ id, seen: at, position: {} });
it("keeps the authored connection first until visited, then avoids immediate loops", () => {
  expect(recommendStory("aral", [], () => null)?.id).toBe("water");
  const recent = [seen("water", 2000), seen("aral")];
  expect(recommendStory("water", recent, () => null)?.id).toBe("river");
  expect(recommendStory("moonfall", [seen("moonfall", 2000), seen("sky")], () => null)?.id).not.toBe("sky");
  expect(
    recommendStory("aral", [seen("aral", 3000), seen("river", 2000), seen("water")], () => null)?.id,
  ).not.toBe("water");
});
it("never invents a destination, recommends itself, or directs someone to a disabled view", () => {
  for (const { id } of searchStories) {
    const next = recommendStory(id, [], () => null);
    expect(searchStories.some((story) => story.id === next?.id)).toBe(true);
    expect(next?.id).not.toBe(id);
    expect(next!.reason.length).toBeGreaterThan(20);
    expect(recommendStory(id, [], () => "unavailable")).toBeNull();
    const fallback = recommendStory(id, [], (candidate) => candidate === next!.id);
    expect(fallback?.id).not.toBe(next!.id);
  }
});
it("uses the oldest related visit after all candidates were seen, skipping the previous story", () => {
  const recent = [seen("sun", 3000), seen("aurora", 2000), seen("north", 1000)];
  expect(recommendStory("sun", recent, () => null)?.id).toBe("north");
});
