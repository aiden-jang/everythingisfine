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
