import { expect, it } from "vitest";
import { readStoryMoment, writeStoryMoment } from "../observations/storyMoment";
import { floatNavigationMoment, readFloatMoment } from "./floatMoment";
import { createFloatPlayback } from "./floatPlayback";
import { argoStation, compileArgoProfile } from "../../sources/argo";
import recorded from "./recorded.json";

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

it("retains map projection with the exact selected profile", () => {
  const params = new URLSearchParams();
  writeStoryMoment(params, {
    id: "float",
    choice: "recorded/6901932/268/1792482240000",
    chapter: "317",
    map: true,
  });
  expect(readFloatMoment(readStoryMoment(params))).toEqual({
    profile: "recorded/6901932/268/1792482240000",
    index: 317,
    map: true,
  });
});

it("keeps a failed remote source in navigation until an explicit replacement is chosen", () => {
  const entry = { profile: "recent/6901932/269/1793363040000", index: 4 };
  const raw = recorded[0]!;
  const fallback = createFloatPlayback(
    compileArgoProfile(argoStation(raw.station)!, raw.measurements)!,
    false,
    "recorded",
  );
  const wanted = { id: "float", choice: entry.profile, chapter: "4", map: true };
  expect(floatNavigationMoment("opening", entry, true)).toEqual(wanted);
  expect(floatNavigationMoment(fallback, entry, true)).toEqual(wanted);
  expect(floatNavigationMoment(null, entry, true)).toBeUndefined();
  expect(floatNavigationMoment(fallback, undefined, false)).toMatchObject({
    choice: `recorded/${fallback.profile.id}`,
    chapter: "0",
    map: false,
  });
  fallback.seek(12);
  expect(
    floatNavigationMoment(fallback, { profile: `recorded/${fallback.profile.id}`, index: 4 }, true),
  ).toMatchObject({ chapter: "12", map: true });
});
