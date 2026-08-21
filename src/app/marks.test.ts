import { describe, expect, it } from "vitest";
import { marksFor, type Happening } from "./marks";

const nothing: Happening = { cyclones: [], volcanoes: [], fires: [], floods: [] };
const storm = (over = {}): never => ({
  id: "1", name: "Fung-wong", lon: 150, lat: 10, peakKmh: 185, track: [], ...over,
} as never);
const mountain = (over = {}): never => ({
  id: "1", name: "Etna", country: "Italy", lon: 15, lat: 37.7, endedAt: null, ...over,
} as never);
const fire = (over = {}): never => ({
  id: "1", country: "Angola", lon: 18, lat: -12, hectares: 9673,
  startedAt: null, endedAt: null, ...over,
} as never);
const flood = (over = {}): never => ({
  id: "1", country: "Thailand", lon: 100.6, lat: 18.7, startedAt: null, endedAt: null, ...over,
} as never);

describe("what gets a shape", () => {
  it("gives a storm a spiral, and a second polyline once it has been somewhere", () => {
    expect(marksFor({ ...nothing, cyclones: [storm()] })).toHaveLength(1);
    expect(marksFor({ ...nothing, cyclones: [
      storm({ track: [{ lon: 155, lat: 8 }, { lon: 148, lat: 14 }] }),
    ] })).toHaveLength(2);
  });

  it("does not emit a track of one point, which is a line with nothing to join", () => {
    expect(marksFor({ ...nothing, cyclones: [storm({ track: [{ lon: 155, lat: 8 }] })] }))
      .toHaveLength(1);
  });

  it("gives each volcano one triangle and each fire one flame", () => {
    expect(marksFor({ ...nothing, volcanoes: [mountain(), mountain({ name: "Fuego" })] }))
      .toHaveLength(2);
    expect(marksFor({ ...nothing, fires: [fire(), fire({ id: "2" })] })).toHaveLength(2);
  });

  it("gives each flood three strokes, spread rather than nested", () => {
    const marks = marksFor({ ...nothing, floods: [flood()] });
    expect(marks).toHaveLength(3);
    // Spread, not pushed: a nested array would reach the layer as one shape of three points.
    for (const m of marks) expect(m.points.length).toBeGreaterThan(4);
    // All three on the same anchor, so they scale as one glyph and do not drift apart.
    for (const m of marks) expect(m.anchor).toEqual({ lon: 100.6, lat: 18.7 });
  });

  it("puts the triangle on the mountain and the flame on the fire", () => {
    const [tri] = marksFor({ ...nothing, volcanoes: [mountain()] });
    expect(Math.min(...tri!.points.map((p) => p.lat))).toBeCloseTo(37.7, 6);
    const [lick] = marksFor({ ...nothing, fires: [fire()] });
    expect(Math.min(...lick!.points.map((p) => p.lat))).toBeCloseTo(-12, 6);
  });

  it("draws every layer together rather than one winning", () => {
    expect(marksFor({
      cyclones: [storm()], volcanoes: [mountain()], fires: [fire()], floods: [flood()],
    })).toHaveLength(1 + 1 + 1 + 3);
  });

  it("is nothing when nothing is happening", () => {
    expect(marksFor(nothing)).toEqual([]);
  });

  it("anchors a glyph and leaves a track unanchored, which is what decides scaling", () => {
    const marks = marksFor({ ...nothing, cyclones: [
      storm({ track: [{ lon: 155, lat: 8 }, { lon: 148, lat: 14 }] }),
    ] });
    const [track, glyph] = marks;
    expect(track!.anchor).toBeUndefined();
    expect(glyph!.anchor).toEqual({ lon: 150, lat: 10 });
  });
});

describe("the far-side figure", () => {
  it("draws nothing until an event is traced", () => {
    expect(marksFor({ ...nothing, farSide: null })).toEqual([]);
    expect(marksFor(nothing)).toEqual([]);
  });

  it("is five arcs and a two-stroke cross", () => {
    expect(marksFor({ ...nothing, farSide: { lon: 140, lat: 38 } })).toHaveLength(5 + 2);
  });

  it("anchors none of it, because the point is how big the front gets", () => {
    /*
     * A 90-degree circle held at a constant size on screen would be the one thing this figure cannot
     * afford: it is 40,030 km of front, and shrinking it to a glyph is the argument thrown away.
     */
    for (const m of marksFor({ ...nothing, farSide: { lon: 140, lat: 38 } })) {
      expect(m.anchor).toBeUndefined();
    }
  });

  it("puts the cross on the far side and not on the epicentre", () => {
    const marks = marksFor({ ...nothing, farSide: { lon: 140, lat: 38 } });
    const cross = marks.slice(-2).flatMap((m) => m.points);
    // 140E 38N flips to 40W 38S.
    expect(cross.every((p) => p.lat < 0)).toBe(true);
    expect(cross.every((p) => p.lon < 0)).toBe(true);
  });

  it("draws beside the live layers rather than instead of them", () => {
    const marks = marksFor({
      ...nothing, volcanoes: [mountain()], farSide: { lon: 140, lat: 38 },
    });
    expect(marks).toHaveLength(1 + 5 + 2);
  });
});

describe("the plate-motion arrows", () => {
  const sample = (over: Partial<Record<number, unknown>> = {}): never =>
    [0, 0, 90, 100, -1, "SUB"].map((v, i) => over[i] ?? v) as never;

  it("draws nothing when the toggle is off", () => {
    expect(marksFor({ ...nothing, motion: [] })).toEqual([]);
    expect(marksFor(nothing)).toEqual([]);
  });

  it("is three strokes per arrow", () => {
    expect(marksFor({ ...nothing, motion: [sample()] })).toHaveLength(3);
    expect(marksFor({ ...nothing, motion: [sample(), sample({ 0: 40 })] })).toHaveLength(6);
  });

  it("anchors none of them, because an arrow's length is its speed", () => {
    // Held at a constant size on screen, the only quantity these carry would be deleted.
    for (const m of marksFor({ ...nothing, motion: [sample()] })) {
      expect(m.anchor).toBeUndefined();
    }
  });

  it("draws a faster boundary longer than a slower one", () => {
    const spanOf = (rate: number): number => {
      const [shaft] = marksFor({ ...nothing, motion: [sample({ 3: rate })] });
      const [tail, tip] = shaft!.points;
      return Math.abs(tip!.lon - tail!.lon);
    };
    expect(spanOf(230)).toBeGreaterThan(spanOf(20));
  });

  it("draws beside the live layers rather than instead of them", () => {
    expect(marksFor({ ...nothing, volcanoes: [mountain()], motion: [sample()] })).toHaveLength(1 + 3);
  });
});
