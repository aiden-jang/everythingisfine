import { describe, expect, it } from "vitest";
import samples from "./plateMotion.json";
import { arrowLengthDeg, motionArrow, summariseMotion, type MotionSample } from "./plateMotion";
import { distanceKm, EARTH_RADIUS_KM } from "./sphere";

const MOTION = samples as MotionSample[];
const CLASSES = new Set(["OSR", "OTF", "SUB", "CRB", "CTF", "CCB", "OCB"]);

describe("the generated table", () => {
  it("is the 231 arrows the generator reported, from 5,819 steps", () => {
    // Fails loudly if a regeneration silently changes the sampling.
    expect(MOTION).toHaveLength(231);
  });

  it("holds six fields per row, in range, with a known boundary class", () => {
    for (const [lon, lat, azimuth, rate, sign, cls] of MOTION) {
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(azimuth).toBeGreaterThanOrEqual(0);
      expect(azimuth).toBeLessThanOrEqual(360);
      expect(rate).toBeGreaterThan(0);
      expect([-1, 0, 1]).toContain(sign);
      expect(CLASSES.has(cls)).toBe(true);
    }
  });

  it("carries Bird's real spread of rates rather than a flattened one", () => {
    const rates = MOTION.map((s) => s[3]);
    expect(Math.max(...rates)).toBeGreaterThan(200);
    expect(Math.min(...rates)).toBeLessThan(5);
  });

  it("has both closing and opening boundaries in it", () => {
    const { converging, arrows } = summariseMotion(MOTION);
    expect(converging).toBeGreaterThan(0);
    expect(converging).toBeLessThan(arrows);
  });
});

describe("arrow length is speed, rooted", () => {
  it("is longest at the fastest boundary on Earth and shortest at the slowest", () => {
    expect(arrowLengthDeg(263.3)).toBeCloseTo(3.4, 6);
    expect(arrowLengthDeg(0.3)).toBe(0.35);
  });

  it("rises with rate, and never to zero", () => {
    expect(arrowLengthDeg(100)).toBeGreaterThan(arrowLengthDeg(30));
    expect(arrowLengthDeg(0)).toBe(0.35);
    expect(arrowLengthDeg(-5)).toBe(0.35);
  });

  it("puts the median nearer a third of the longest than a fiftieth, which is why it is rooted", () => {
    /*
     * The reason for the square root: the range is 0.3 to 263 mm/a, and linear scaling would draw the
     * median 30 mm/a boundary at a fiftieth of the longest arrow, which is not a mark.
     */
    const ratio = arrowLengthDeg(29.9) / arrowLengthDeg(263.3);
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.4);
  });
});

describe("an arrow walked on the sphere, not offset in degrees", () => {
  it("is a shaft and two barbs, all meeting at the tip", () => {
    const strokes = motionArrow(0, 0, 90, 100);
    expect(strokes).toHaveLength(3);
    const tip = strokes[0]![1]!;
    for (const barb of strokes.slice(1)) {
      expect(barb[1]!.lon).toBeCloseTo(tip.lon, 9);
      expect(barb[1]!.lat).toBeCloseTo(tip.lat, 9);
    }
  });

  it("starts on the sampled point", () => {
    const [shaft] = motionArrow(23.4, -17.8, 45, 60);
    expect(shaft![0]).toEqual({ lon: 23.4, lat: -17.8 });
  });

  it("points where the azimuth says, clockwise from north", () => {
    const north = motionArrow(0, 0, 0, 263.3)[0]![1]!;
    expect(north.lat).toBeGreaterThan(3);
    expect(north.lon).toBeCloseTo(0, 6);
    const east = motionArrow(0, 0, 90, 263.3)[0]![1]!;
    expect(east.lon).toBeGreaterThan(3);
    expect(east.lat).toBeCloseTo(0, 6);
    const south = motionArrow(0, 0, 180, 263.3)[0]![1]!;
    expect(south.lat).toBeLessThan(-3);
  });

  it("covers the same ground whatever the latitude, which offsetting in degrees would not", () => {
    /*
     * The bug this formula avoids: adding degrees to a longitude at 60 north covers half the distance it
     * does at the equator, so every arrow away from the tropics would be drawn short and turned.
     */
    const arc = (lat: number): number => {
      const tip = motionArrow(0, lat, 90, 263.3)[0]![1]!;
      return distanceKm(0, lat, tip.lon, tip.lat);
    };
    const want = (3.4 / 180) * Math.PI * EARTH_RADIUS_KM;
    expect(arc(0)).toBeCloseTo(want, 0);
    expect(arc(60)).toBeCloseTo(want, 0);
    expect(arc(-45)).toBeCloseTo(want, 0);
  });

  it("keeps longitude in range for an arrow drawn across the date line", () => {
    for (const stroke of motionArrow(179.6, 12, 90, 263.3)) {
      for (const p of stroke) {
        expect(p.lon).toBeGreaterThanOrEqual(-180);
        expect(p.lon).toBeLessThanOrEqual(180);
      }
    }
  });

  it("draws every real sample without producing a NaN", () => {
    for (const [lon, lat, azimuth, rate] of MOTION) {
      for (const stroke of motionArrow(lon, lat, azimuth, rate)) {
        for (const p of stroke) {
          expect(Number.isFinite(p.lon)).toBe(true);
          expect(Number.isFinite(p.lat)).toBe(true);
        }
      }
    }
  });
});
