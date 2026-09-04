import { describe, expect, it } from "vitest";
import { createMarkLayer, scaleFor } from "./marks";
import { spiral, volcano } from "./shapes";

/*
 * Ported from the cyclone layer these tests were written against, when volcanoes made it the third
 * phenomenon and it became one layer taking polylines. The behaviour they pin is the layer's, not any
 * one phenomenon's, which is the reason the generalisation was safe to make.
 */

const count = (layer: { object: { geometry: { drawRange: { count: number } } } }): number =>
  layer.object.geometry.drawRange.count;

const mark = (points: readonly { lon: number; lat: number }[], lon: number, lat: number) => ({
  points,
  anchor: { lon, lat },
});

const spanOf = (layer: { object: { geometry: BufferGeometryLike } }): number => {
  const g = layer.object.geometry;
  const ll = g.getAttribute("aLonLat").array as Float32Array;
  const used = [...ll.slice(0, g.drawRange.count * 2)];
  const lons = used.filter((_, i) => i % 2 === 0);
  return Math.max(...lons) - Math.min(...lons);
};

interface BufferGeometryLike {
  drawRange: { count: number };
  getAttribute: (name: string) => { array: ArrayLike<number> };
}

describe("the marks layer", () => {
  it("draws a single shape", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(spiral(150, 10), 150, 10)]);
    expect(count(layer)).toBeGreaterThan(0);
    layer.dispose();
  });

  it("draws more for more shapes", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(spiral(150, 10), 150, 10)]);
    const one = count(layer);
    layer.set([mark(spiral(150, 10), 150, 10), mark(volcano(15, 37.7), 15, 37.7)]);
    expect(count(layer)).toBeGreaterThan(one);
    layer.dispose();
  });

  it("clears what it drew last time rather than accumulating", () => {
    // The set is replaced every ten minutes, and a layer that appended would grow a season of ghosts.
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(spiral(150, 10), 150, 10), mark(spiral(-40, 20), -40, 20)]);
    const two = count(layer);
    layer.set([mark(spiral(150, 10), 150, 10)]);
    expect(count(layer)).toBeLessThan(two);
    layer.set([]);
    expect(count(layer)).toBe(0);
    layer.dispose();
  });

  it("stays inside its buffer when handed more than could ever exist", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set(Array.from({ length: 400 }, (_, i) => mark(spiral(i - 200, 10, 6), i - 200, 10)));
    const room = layer.object.geometry.getAttribute("position").count;
    expect(count(layer)).toBeLessThanOrEqual(room);
    layer.dispose();
  });

  it("writes only finite positions, which a draw call needs", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([
      {
        points: [
          { lon: 179, lat: 10 },
          { lon: 180, lat: 11 },
        ],
      },
      mark(volcano(0, 90), 0, 90),
    ]);
    const pos = layer.object.geometry.getAttribute("position").array as Float32Array;
    expect([...pos.slice(0, count(layer) * 3)].every(Number.isFinite)).toBe(true);
    layer.dispose();
  });

  it("drops a leg that wraps the antimeridian instead of ruling a line across the map", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([
      {
        points: [
          { lon: 179, lat: 10 },
          { lon: -179, lat: 11 },
        ],
      },
    ]);
    expect(count(layer)).toBe(0);
    layer.dispose();
  });

  it("keeps a shape that merely sits near the seam", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(volcano(179.4, -16.7), 179.4, -16.7)]);
    expect(count(layer)).toBeGreaterThan(0);
    layer.dispose();
  });

  it("splits a long leg, so a track is drawn on the sphere and not through it", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([
      {
        points: [
          { lon: 0, lat: 0 },
          { lon: 30, lat: 0 },
        ],
      },
    ]);
    // 30 degrees at a 1.5-degree step is twenty segments, not the one that was handed in.
    expect(count(layer)).toBe(20 * 2);
    layer.dispose();
  });
});

describe("a glyph holds its size on screen, the way the markers do", () => {
  it("grows the glyph as the camera pulls back", () => {
    /*
     * The bug this exists for: at the framing the app opens on, a degree-sized flame was five pixels of
     * thin grey line, so a hundred fires were invisible under a legend describing them.
     */
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(volcano(0, 0, 1.6), 0, 0)]);
    layer.setZoom(2.5);
    const near = spanOf(layer);
    layer.setZoom(0.5);
    expect(spanOf(layer)).toBeGreaterThan(near * 2);
    layer.dispose();
  });

  it("shrinks it back on the way in", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(volcano(0, 0, 1.6), 0, 0)]);
    layer.setZoom(0.5);
    const far = spanOf(layer);
    layer.setZoom(2.5);
    expect(spanOf(layer)).toBeLessThan(far);
    layer.dispose();
  });

  it("leaves a track alone, because a measured path is not a symbol", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([
      {
        points: [
          { lon: 0, lat: 0 },
          { lon: 20, lat: 0 },
        ],
      },
    ]);
    layer.setZoom(2.5);
    const near = spanOf(layer);
    layer.setZoom(0.2);
    expect(spanOf(layer)).toBeCloseTo(near, 3);
    layer.dispose();
  });

  it("is unity at the zoom the shape sizes were tuned for", () => {
    expect(scaleFor(2.5)).toBe(1);
  });

  it("clamps, since the zoom range runs to 0.05 and 50x a flame is a continent", () => {
    expect(scaleFor(0.01)).toBeLessThanOrEqual(6);
    expect(scaleFor(1000)).toBeGreaterThanOrEqual(0.6);
    expect(scaleFor(0)).toBe(1);
    expect(scaleFor(Number.NaN)).toBe(1);
  });

  it("ignores a zoom nudge too small to see, so a wheel gesture is not a rebuild per frame", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(volcano(0, 0, 1.6), 0, 0)]);
    layer.setZoom(2.5);
    const before = spanOf(layer);
    layer.setZoom(2.51);
    expect(spanOf(layer)).toBe(before);
    layer.dispose();
  });

  it("keeps a scaled glyph on the planet rather than past the pole", () => {
    const layer = createMarkLayer({ value: 0 });
    layer.set([mark(volcano(0, 88, 1.6), 0, 88)]);
    layer.setZoom(0.05);
    const g = layer.object.geometry;
    const ll = g.getAttribute("aLonLat").array as Float32Array;
    const lats = [...ll.slice(0, g.drawRange.count * 2)].filter((_, i) => i % 2 === 1);
    expect(Math.max(...lats)).toBeLessThanOrEqual(90);
    layer.dispose();
  });
});
