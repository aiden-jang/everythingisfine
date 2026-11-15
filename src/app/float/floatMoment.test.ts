import { expect, it } from "vitest";
import { readStoryMoment, writeStoryMoment } from "../observations/storyMoment";
import { readFloatMoment } from "./floatMoment";

it("round-trips the exact Argo profile and selected sample", () => {
  const params = new URLSearchParams();
  writeStoryMoment(params, {
    id: "float",
    choice: "recorded/6901932/268/1792482240000",
    chapter: "596",
    map: false,
  });
  expect(readFloatMoment(readStoryMoment(params))).toEqual({
    profile: "recorded/6901932/268/1792482240000",
    index: 596,
  });
});

it("rejects malformed float links before they can choose an arbitrary source", () => {
  for (const [choice, chapter] of [
    ["https://example.com/private", "1"],
    ["recent/6901932/268/1792482240000", "20001"],
    ["recorded/6901932/268/1792482240000", "-1"],
    ["recorded/6901932/268/1792482240000", "1.2"],
  ]) {
    expect(
      readStoryMoment(new URLSearchParams({ story: "float", choice: choice!, chapter: chapter! })),
    ).toBeUndefined();
  }
});
