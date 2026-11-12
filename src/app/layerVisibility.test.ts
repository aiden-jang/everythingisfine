import { describe, expect, it } from "vitest";
import { allMapLayers, readMapLayers, visibleHazards } from "./layerVisibility";

describe("independent map layers", () => {
  it("validates saved preferences and keeps explicitly shared targets visible", () => {
    expect(readMapLayers("broken")).toEqual(allMapLayers);
    expect(readMapLayers('{"fires":false,"floods":"false"}')).toEqual({ ...allMapLayers, fires: false });
    expect(readMapLayers('{"earthquakes":false}', "quake:one").earthquakes).toBe(true);
    expect(readMapLayers('{"cyclones":false}', "cyclone:one").cyclones).toBe(true);
    expect(readMapLayers('{"fires":false}', "cyclone:one").fires).toBe(false);
  });
  it("hides only the requested layer without discarding cached observations", () => {
    const data = { cyclones: [], fires: [], floods: [], volcanoes: [], aurora: { peak: 42 } };
    const visible = visibleHazards(data, { ...allMapLayers, aurora: false });
    expect(visible.aurora).toBeNull();
    expect(visible.floods).toBe(data.floods);
    expect(data.aurora).toEqual({ peak: 42 });
    expect(visibleHazards(data, allMapLayers).aurora).toBe(data.aurora);
  });
});
