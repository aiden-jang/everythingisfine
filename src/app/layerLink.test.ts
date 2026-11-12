import { describe, expect, it } from "vitest";
import { decode, encode, type Permalink } from "./permalink";
import { defaultMapLayers, readMapLayers } from "./layerVisibility";
import { latestLayerTimes } from "./layerLink";
import { layerTime } from "./layerTime";

const view: Permalink = {
  lon: 179,
  lat: -42,
  zoom: 2,
  minMagnitude: 2,
  windowHours: 168,
  sources: ["usgs", "emsc"],
  ramp: "thermal",
  event: null,
  section: null,
  cursor: null,
  day: null,
  mark: null,
};

describe("shared background layers", () => {
  it("preserves scene discovery and a closed catalogue independently of projection", () => {
    for (const scene of ["live", "depth", "night"] as const) {
      for (const catalogue of [scene, "all", undefined] as const) {
        const restored = decode(encode({ ...view, flat: true, scene, ...(catalogue ? { catalogue } : {}) }));
        expect(restored.scene).toBe(scene);
        expect(restored.catalogue).toBe(catalogue);
      }
    }
    expect(decode("scene=wrong&catalogue=wrong").scene).toBeUndefined();
    expect(decode("scene=wrong&catalogue=wrong").catalogue).toBeUndefined();
  });
  it("keeps the exact combination and held weather times across projection links", () => {
    const layers = { ...defaultMapLayers, earthquakes: false, wind: true, aurora: false };
    const layerTimes = { ...latestLayerTimes, radar: 1_794_499_200_000, wind: 1_794_502_800_000 };
    for (const flat of [false, true]) {
      const restored = decode(encode({ ...view, flat, layers, layerTimes }));
      expect(restored).toMatchObject({ flat, layers, layerTimes });
      expect(restored.cursor).toBeUndefined();
      expect(readMapLayers(JSON.stringify(restored.layers))).toEqual(layers);
    }
  });
  it("distinguishes all layers off from an old link with no layer settings", () => {
    expect(Object.values(decode("layers=").layers!)).toEqual(Array(9).fill(false));
    expect(decode("p=map").layers).toBeUndefined();
    expect(decode("layers=nonsense").layers).toBeUndefined();
    expect(decode("layers=radar,nonsense").layers).toEqual({
      ...Object.fromEntries(Object.keys(defaultMapLayers).map((id) => [id, false])),
      radar: true,
    });
  });
  it("rejects invalid timestamps and keeps latest times unpinned", () => {
    for (const bad of ["", "Infinity", "yesterday", "-1", "999999999999999"])
      expect(decode(`radarAt=${bad}`).layerTimes).toBeUndefined();
    expect(decode(encode({ ...view, layerTimes: latestLayerTimes })).layerTimes).toBeUndefined();
    expect(decode("windAt=1794502800").layerTimes).toEqual({ ...latestLayerTimes, wind: 1_794_502_800_000 });
  });
  it("formats full UTC dates unambiguously across midnight and years", () => {
    expect(layerTime(Date.parse("2026-12-31T23:59:00Z"))).toBe("31 Dec 2026, 23:59 UTC");
    expect(layerTime(Date.parse("2027-01-01T00:00:00Z"))).toBe("1 Jan 2027, 00:00 UTC");
  });
});
