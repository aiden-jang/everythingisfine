import { expect, it } from "vitest";
import { argoStation, compileArgoProfile } from "../../sources/argo";
import recorded from "./recorded.json";
import { createFloatPlayback } from "./floatPlayback";

it("pauses inspection at the measured sample and resumes without losing its depth", () => {
  const raw = recorded[0]!;
  const station = argoStation(raw.station)!;
  const profile = compileArgoProfile(station, raw.measurements)!;
  const view = createFloatPlayback(profile, true, "recorded");
  view.step(3);
  const index = view.read().index;
  const depth = view.depth();
  view.inspect(true);
  expect(view.read()).toMatchObject({ index, playing: false, inspecting: true });
  expect(view.step(30)).toBe(false);
  expect(view.depth()).toBe(depth);
  view.toggle();
  view.inspect(false);
  expect(view.read()).toMatchObject({ playing: true, inspecting: false });
  view.locate();
  expect(view.read()).toMatchObject({ index, stage: "locate", inspecting: false });
  view.rise();
  view.toggle();
  view.step(1);
  expect(view.read().index).toBeGreaterThan(index);
  view.notice();
  expect(view.read()).toMatchObject({ index: profile.samples.length - 1, stage: "notice", playing: false });
});

it("rounds and bounds selections without allowing non-finite samples", () => {
  const raw = recorded[0]!;
  const profile = compileArgoProfile(argoStation(raw.station)!, raw.measurements)!;
  const view = createFloatPlayback(profile, false, "recorded");
  view.seek(10.8);
  expect(view.read().index).toBe(11);
  view.seek(NaN);
  view.seek(Infinity);
  expect(view.read().index).toBe(11);
  view.seek(-4);
  expect(view.read().index).toBe(0);
  view.seek(100_000);
  expect(view.read().index).toBe(profile.samples.length - 1);
  expect(view.depth()).toBe(profile.samples.at(-1)!.depth);
});
