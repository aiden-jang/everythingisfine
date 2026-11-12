import { expect, test } from "vitest";
import {
  composeMapLayers,
  isLandingPresentation,
  weatherFeed,
  weatherFrame,
  weatherOverlay,
} from "./weatherLayers";
import { defaultMapLayers, readMapLayers } from "./layerVisibility";
import { isLocalView } from "../globe/scenePresentation";

test("weather is opt-in and saved selections survive older preference schemas", () => {
  expect(readMapLayers(null)).toMatchObject({ wind: false, lightning: false, radar: true });
  expect(readMapLayers('{"wind":true,"lightning":true,"radar":false}')).toMatchObject({
    wind: true,
    lightning: true,
    radar: false,
  });
  expect(readMapLayers('{"wind":"true"}')).toEqual(defaultMapLayers);
});

test("wind opens near now while lightning opens at the latest scan; scrubbing stays independent", () => {
  const data = {
    target: { lon: 0, lat: 0, zoom: 1 },
    note: "synthetic",
    frames: [{ at: 100 }, { at: 200 }, { at: 300 }],
  };
  expect(weatherFrame(data, "wind", null, 210)?.at).toBe(200);
  expect(weatherFrame(data, "lightning", null, 210)?.at).toBe(300);
  expect(weatherFrame(data, "wind", 100, 210)?.at).toBe(100);
  expect(weatherFrame(null, "lightning", null, 210)).toBeUndefined();
});

test("layers share one overlay without losing either geometry or acquiring a camera flight", () => {
  const wind = {
    at: 100,
    paths: [
      {
        points: [
          { lon: -80, lat: 20 },
          { lon: -70, lat: 22 },
        ],
      },
    ],
    flow: true,
  };
  const lightning = { at: 200, marks: [{ lon: -80, lat: 25 }] };
  const overlay = weatherOverlay(wind, lightning)!;
  expect(overlay.frame.paths).toBe(wind.paths);
  expect(overlay.frame.marks).toBe(lightning.marks);
  expect(weatherOverlay(wind)?.target).toBe(overlay.target);
  expect(weatherOverlay(undefined, lightning)?.frame.paths).toBeUndefined();
  expect(weatherOverlay()).toBeNull();
  expect(isLocalView({ kind: "map-layers", radar: null, observation: overlay })).toBe(false);
});

test("weather health distinguishes pending, failure, empty and delayed readings", () => {
  expect(weatherFeed("wind", "loading", undefined).state).toBe("pending");
  expect(weatherFeed("wind", "failed", 123)).toMatchObject({ state: "failed", lastCheck: 123 });
  expect(weatherFeed("lightning", "empty", 123)).toMatchObject({
    state: "ok",
    message: "Available · no recent data",
  });
  expect(weatherFeed("lightning", "ready", 1_800_000, 0).message).toContain("delayed");
  expect(weatherFeed("wind", "ready", 100, 200).message).toBeUndefined();
});

test("landing layers retain the dayline and rotation without taking over cinematic views", () => {
  const radar = { kind: "radar-layer" as const, region: "world", image: null, at: 123 };
  const layers = { kind: "map-layers" as const, radar, observation: null };
  const compose = composeMapLayers(layers);
  expect(compose(null)).toBe(layers);
  const landing = compose("landing");
  expect(landing).toMatchObject({ ...layers, base: "landing" });
  expect(compose("landing")).toBe(landing);
  expect(isLandingPresentation(landing)).toBe(true);
  expect(isLocalView(landing)).toBe(false);
  expect(compose("dayline")).toMatchObject({ ...layers, base: "dayline" });
  expect(isLandingPresentation(compose("dayline"))).toBe(false);
  expect(isLandingPresentation(compose(null))).toBe(false);
  expect(compose("planetarium")).toBe("planetarium");
  const story = {
    kind: "observation" as const,
    frame: { at: 123 },
    image: null,
    target: { lon: 0, lat: 0, zoom: 1 },
  };
  expect(compose(story)).toBe(story);
  expect(composeMapLayers(null)("landing")).toBe("landing");
});
