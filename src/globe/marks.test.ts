import { describe, expect, it } from "vitest";
import { createMarkLayer } from "./marks";
import { spiral, volcano } from "./shapes";

/*
 * Ported from the cyclone layer these tests were written against, when volcanoes made it the third
 * phenomenon and it became one layer taking polylines. The behaviour they pin is the layer's, not any
 * one phenomenon's, which is the reason the generalisation was safe to make.
 */

const count = (layer: { object: { geometry: { drawRange: { count: number } } } }): number =>
  layer.object.geometry.drawRange.count;

describe("the marks layer", () => {
  it("draws a single shape", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([spiral(150, 10)]);
    expect(count(layer)).toBeGreaterThan(0);
    layer.dispose();
  });

  it("draws more for more shapes", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([spiral(150, 10)]);
    const one = count(layer);
    layer.set([spiral(150, 10), volcano(15, 37.7)]);
    expect(count(layer)).toBeGreaterThan(one);
    layer.dispose();
  });

  it("clears what it drew last time rather than accumulating", () => {
    // The set is replaced every ten minutes, and a layer that appended would grow a season of ghosts.
    const layer = createMarkLayer({ value: 0 });
    layer.set([spiral(150, 10), spiral(-40, 20)]);
    const two = count(layer);
    layer.set([spiral(150, 10)]);
    expect(count(layer)).toBeLessThan(two);
    layer.set([]);
    expect(count(layer)).toBe(0);
    layer.dispose();
  });

  it("stays inside its buffer when handed more than could ever exist", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set(Array.from({ length: 400 }, (_, i) => spiral(i - 200, 10, 6)));
    const room = layer.object.geometry.getAttribute("position").count;
    expect(count(layer)).toBeLessThanOrEqual(room);
    layer.dispose();
  });

  it("writes only finite positions, which a draw call needs", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([[{ lon: 179, lat: 10 }, { lon: 180, lat: 11 }], volcano(0, 90)]);
    const pos = layer.object.geometry.getAttribute("position").array as Float32Array;
    expect([...pos.slice(0, count(layer) * 3)].every(Number.isFinite)).toBe(true);
    layer.dispose();
  });

  it("drops a leg that wraps the antimeridian instead of ruling a line across the map", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([[{ lon: 179, lat: 10 }, { lon: -179, lat: 11 }]]);
    expect(count(layer)).toBe(0);
    layer.dispose();
  });

  it("keeps a shape that merely sits near the seam", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([volcano(179.4, -16.7)]);
    expect(count(layer)).toBeGreaterThan(0);
    layer.dispose();
  });

  it("splits a long leg, so a track is drawn on the sphere and not through it", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([[{ lon: 0, lat: 0 }, { lon: 30, lat: 0 }]]);
    // 30 degrees at a 1.5-degree step is twenty segments, not the one that was handed in.
    expect(count(layer)).toBe(20 * 2);
    layer.dispose();
  });
});
