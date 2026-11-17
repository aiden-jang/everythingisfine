import { expect, it, vi } from "vitest";
import { argoStation, compileArgoProfile } from "../sources/argo";
import { createFloatPlayback } from "../app/float/floatPlayback";
import recorded from "../app/float/recorded.json";
import type { Controls } from "./controls";
import { createFloatPresentation } from "./floatPresentation";

vi.mock("./floatSurface", () => ({
  createFloatSurface: () => ({ object: {}, draw: vi.fn(), size: () => ({ x: 0, y: 0 }) }),
}));

it("keeps the measured ascent on elapsed time when rendering is slower than camera integration", () => {
  const raw = recorded[0]!;
  const profile = compileArgoProfile(argoStation(raw.station)!, raw.measurements)!;
  const view = createFloatPlayback(profile, false, "recorded");
  const controls = {
    state: () => ({ lon: profile.lon, lat: profile.lat, zoom: 1.35 }),
    guidance: { following: () => true },
    flyTo: vi.fn(),
  } as unknown as Controls;
  const presentation = createFloatPresentation(controls, {} as HTMLCanvasElement);
  view.locate();
  presentation.set(view, false);
  presentation.step(0, true, 0);
  presentation.step(0.25, false, 10);
  expect(view.read()).toMatchObject({ index: 0, stage: "locate" });
  view.toggle();
  presentation.step(0, true, 0);
  for (let elapsed = 0; elapsed < 11; elapsed++) presentation.step(0.25, false, 1);
  expect(view.read()).toMatchObject({
    index: profile.samples.length - 1,
    stage: "notice",
    playing: false,
  });
  view.seek(100);
  presentation.step(0.25, false, 30);
  expect(view.read()).toMatchObject({ index: 100, playing: false });
});
