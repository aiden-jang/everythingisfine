import { expect, it } from "vitest";
import { searchStories } from "./storyIndex";

it("ships a recorded preview for every catalogue entry without obsolete images", () => {
  const files = import.meta.glob("../assets/story-previews/*.webp");
  expect(
    Object.keys(files)
      .map((file) => file.split("/").at(-1)!.replace(".webp", ""))
      .sort(),
  ).toEqual(searchStories.map(({ id }) => id).sort());
});
