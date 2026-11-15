import { expect, test } from "vitest";
import { storyShare } from "./storyShare";
import { readStoryMoment } from "./storyMoment";

test("sharing supplies a useful title and exact moment without unrelated camera or search state", () => {
  const moment = { id: "megaflash", at: 1508662606921, map: true };
  const share = storyShare(moment, "https://example.com/#at=-74,40,1&query=private&story=ice");
  expect(share.title).toBe("Megaflash · Everything is fine.");
  expect(share.text).toContain("satellite detections");
  const params = new URLSearchParams(new URL(share.url).hash.slice(1));
  expect(readStoryMoment(params)).toEqual(moment);
  expect(params.has("at")).toBe(false);
  expect(params.has("query")).toBe(false);
});
