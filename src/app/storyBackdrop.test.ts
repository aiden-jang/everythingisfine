import { expect, it } from "vitest";
import { observatoryBackdrop } from "./storyBackdrop";

it("keeps the float's ocean section free of unrelated measurements", () => {
  const props = observatoryBackdrop({
    browsingStories: false,
    depthFocus: null,
    floatDive: { active: true },
  });
  expect(props).toEqual({
    depthSink: false,
    cutaway: null,
    slab: null,
    figures: null,
    section: null,
    inspection: null,
    aurora: null,
  });
});

it("leaves other active stories and normal layers with their own source choices", () => {
  expect(
    observatoryBackdrop({ browsingStories: false, depthFocus: null, floatDive: { active: false } }),
  ).toEqual({});
  expect(
    observatoryBackdrop({ browsingStories: true, depthFocus: null, floatDive: { active: false } }).aurora,
  ).toBeUndefined();
});
