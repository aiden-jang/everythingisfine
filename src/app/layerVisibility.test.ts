import { describe, expect, it } from "vitest";
import {
  defaultMapLayers,
  isolateLayer,
  markBelongsToLayer,
  readMapLayers,
  visibleHazards,
} from "./layerVisibility";

describe("independent map layers", () => {
  it("keeps selections in unrelated layers", () => {
    expect(markBelongsToLayer("cyclone:123", "fires")).toBe(false);
    expect(markBelongsToLayer("cyclone:123", "cyclones")).toBe(true);
    expect(markBelongsToLayer(null, "earthquakes")).toBe(false);
  });
  it("validates saved preferences and keeps explicitly shared targets visible", () => {
    expect(readMapLayers(null).radar).toBe(true);
    expect(readMapLayers('{"earthquakes":false}').radar).toBe(true);
    expect(readMapLayers('{"radar":false}').radar).toBe(false);
    expect(readMapLayers('{"radar":true}').radar).toBe(true);
    expect(readMapLayers("broken")).toEqual(defaultMapLayers);
    expect(readMapLayers('{"fires":false,"floods":"false"}')).toEqual({ ...defaultMapLayers, fires: false });
    expect(readMapLayers('{"earthquakes":false}', "quake:one").earthquakes).toBe(true);
    expect(readMapLayers('{"cyclones":false}', "cyclone:one").cyclones).toBe(true);
    expect(readMapLayers('{"fires":false}', "cyclone:one").fires).toBe(false);
  });
  it("hides only the requested layer without discarding cached observations", () => {
    const data = { cyclones: [], fires: [], floods: [], volcanoes: [], aurora: { peak: 42 } };
    const visible = visibleHazards(data, { ...defaultMapLayers, aurora: false });
    expect(visible.aurora).toBeNull();
    expect(visible.floods).toBe(data.floods);
    expect(data.aurora).toEqual({ peak: 42 });
    expect(visibleHazards(data, defaultMapLayers).aurora).toBe(data.aurora);
  });
});

it("temporary isolation restores the exact saved selection without mutating it", () => {
  const saved = { ...defaultMapLayers, fires: false, radar: false, wind: true };
  const before = { ...saved };
  const focused = isolateLayer(saved, "radar");
  expect(
    Object.entries(focused)
      .filter(([, on]) => on)
      .map(([id]) => id),
  ).toEqual(["radar"]);
  expect(saved).toEqual(before);
  expect(isolateLayer(saved, null)).toBe(saved);
});
