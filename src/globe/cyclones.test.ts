import { describe, expect, it } from "vitest";
import { createCycloneLayer, spiral } from "./cyclones";
import type { Cyclone } from "../sources/cyclones";

describe("the cyclone glyph", () => {
  it("starts at the storm and winds outward", () => {
    const s = spiral(140, 20);
    expect(s[0]).toEqual({ lon: 140, lat: 20 });
    const last = s[s.length - 1]!;
    expect(Math.hypot(last.lon - 140, last.lat - 20)).toBeGreaterThan(2);
  });

  it("stays round away from the equator instead of being squeezed", () => {
    /*
     * Longitude is stretched by 1/cos(lat), the same correction the clustering grid makes. Without it a
     * spiral at 60 degrees is an ellipse twice as tall as it is wide, which reads as a rendering fault
     * rather than as a storm.
     */
    const wide = (lat: number): number => {
      const s = spiral(0, lat);
      const lons = s.map((p) => p.lon);
      const lats = s.map((p) => p.lat);
      const w = (Math.max(...lons) - Math.min(...lons)) * Math.cos((lat * Math.PI) / 180);
      const h = Math.max(...lats) - Math.min(...lats);
      return w / h;
    };
    expect(Math.abs(wide(0) - wide(50))).toBeLessThan(0.15);
  });

  it("does not run away at a latitude no cyclone reaches", () => {
    // 1/cos goes to infinity at the pole, and a clamp is cheaper than a special case.
    const s = spiral(0, 89);
    expect(s.every((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))).toBe(true);
    expect(Math.max(...s.map((p) => Math.abs(p.lon)))).toBeLessThan(20);
  });
});

const storm = (over: Partial<Cyclone> = {}): Cyclone => ({
  id: "1", name: "TEST-26", lon: 140, lat: 20, peakKmh: 200, track: [], ...over,
});

describe("the cyclone layer", () => {
  it("draws a glyph for a storm with no track at all", () => {
    const layer = createCycloneLayer({ value: 0 });
    layer.set([storm()]);
    expect(layer.object.geometry.drawRange.count).toBeGreaterThan(0);
    layer.dispose();
  });

  it("draws more for a storm that has been somewhere", () => {
    const layer = createCycloneLayer({ value: 0 });
    layer.set([storm()]);
    const glyphOnly = layer.object.geometry.drawRange.count;
    layer.set([storm({ track: [
      { lon: 155, lat: 8 }, { lon: 148, lat: 14 }, { lon: 140, lat: 20 },
    ] })]);
    expect(layer.object.geometry.drawRange.count).toBeGreaterThan(glyphOnly);
    layer.dispose();
  });

  it("clears what it drew last time rather than accumulating", () => {
    // The set is replaced every ten minutes, and a layer that appended would grow a season of ghosts.
    const layer = createCycloneLayer({ value: 0 });
    layer.set([storm(), storm({ id: "2" })]);
    const two = layer.object.geometry.drawRange.count;
    layer.set([storm()]);
    expect(layer.object.geometry.drawRange.count).toBeLessThan(two);
    layer.set([]);
    expect(layer.object.geometry.drawRange.count).toBe(0);
    layer.dispose();
  });

  it("stays inside its buffer when handed more storms than could ever exist", () => {
    const layer = createCycloneLayer({ value: 0 });
    const many = Array.from({ length: 200 }, (_, i) => storm({ id: String(i), lon: i - 100 }));
    layer.set(many);
    const room = layer.object.geometry.getAttribute("position").count;
    expect(layer.object.geometry.drawRange.count).toBeLessThanOrEqual(room);
    layer.dispose();
  });

  it("writes only finite positions, which a draw call needs", () => {
    const layer = createCycloneLayer({ value: 0 });
    layer.set([storm({ track: [{ lon: 179, lat: 10 }, { lon: 180, lat: 11 }] })]);
    const pos = layer.object.geometry.getAttribute("position").array as Float32Array;
    expect([...pos.slice(0, layer.object.geometry.drawRange.count * 3)].every(Number.isFinite))
      .toBe(true);
    layer.dispose();
  });
});
