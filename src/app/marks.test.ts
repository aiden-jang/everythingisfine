import { describe, expect, it } from "vitest";
import { marksFor } from "./marks";

const storm = (over = {}) => ({
  id: "1", name: "Fung-wong", lon: 150, lat: 10, peakKmh: 185, track: [], ...over,
} as never);
const mountain = (over = {}) => ({
  id: 1, name: "Etna", country: "Italy", lon: 15, lat: 37.7, endedAt: null, ...over,
} as never);

describe("what gets a shape", () => {
  it("gives a storm a spiral, and a second polyline once it has been somewhere", () => {
    expect(marksFor([storm()], [])).toHaveLength(1);
    expect(marksFor([storm({ track: [{ lon: 155, lat: 8 }, { lon: 148, lat: 14 }] })], []))
      .toHaveLength(2);
  });

  it("does not emit a track of one point, which is a line with nothing to join", () => {
    expect(marksFor([storm({ track: [{ lon: 155, lat: 8 }] })], [])).toHaveLength(1);
  });

  it("gives each volcano exactly one triangle", () => {
    expect(marksFor([], [mountain(), mountain({ name: "Fuego" })])).toHaveLength(2);
  });

  it("puts the triangle on the mountain", () => {
    const [tri] = marksFor([], [mountain()]);
    expect(Math.min(...tri!.map((p) => p.lat))).toBeCloseTo(37.7, 6);
  });

  it("is nothing when nothing is happening", () => {
    expect(marksFor([], [])).toEqual([]);
  });
});
