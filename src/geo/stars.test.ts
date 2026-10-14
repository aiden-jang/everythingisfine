import { describe, expect, it } from "vitest";
import table from "./stars.json";
import { gmstDeg, starBrightness, starVector, STAR_MAG_LIMIT, type StarTable } from "./stars";
import { subsolarPoint } from "./sun";

const stars = table as StarTable;

describe("the committed star table", () => {
  it("is a flat table of three numbers per star", () => {
    expect(stars.length % 3).toBe(0);
    expect(stars.length / 3).toBeGreaterThan(5_000);
    expect(stars.length / 3).toBeLessThan(5_200);
  });

  it("stays inside the celestial coordinate system", () => {
    for (let i = 0; i < stars.length; i += 3) {
      const ra = stars[i]!;
      const dec = stars[i + 1]!;
      const mag = stars[i + 2]!;
      expect(ra, `star ${i / 3} ra`).toBeGreaterThanOrEqual(0);
      expect(ra, `star ${i / 3} ra`).toBeLessThan(360.01);
      expect(Math.abs(dec), `star ${i / 3} dec`).toBeLessThanOrEqual(90);
      expect(mag, `star ${i / 3} mag`).toBeLessThanOrEqual(STAR_MAG_LIMIT);
    }
  });

  it("has the stars anybody could check, where they belong", () => {
    /*
     * Spot-checked against coordinates that are known rather than taken from the same spec the parser
     * was written from. BSC5 carries a B1900 block before the J2000 one and reading the wrong block puts
     * every star about 1.4 degrees out, which is a mistake nothing else here would catch.
     */
    const find = (ra: number, dec: number): number | null => {
      for (let i = 0; i < stars.length; i += 3) {
        if (Math.abs(stars[i]! - ra) < 0.05 && Math.abs(stars[i + 1]! - dec) < 0.05) return stars[i + 2]!;
      }
      return null;
    };
    // Sirius, Polaris, Betelgeuse, Rigel.
    expect(find(101.29, -16.72)).toBeCloseTo(-1.46, 2);
    expect(find(37.95, 89.26)).toBeCloseTo(2.02, 2);
    expect(find(88.79, 7.41)).toBeCloseTo(0.5, 1);
    expect(find(78.63, -8.2)).toBeCloseTo(0.12, 1);
  });

  it("covers both hemispheres, which a sign error would not", () => {
    let north = 0;
    let south = 0;
    for (let i = 1; i < stars.length; i += 3) {
      if (stars[i]! > 30) north += 1;
      else if (stars[i]! < -30) south += 1;
    }
    expect(north).toBeGreaterThan(700);
    expect(south).toBeGreaterThan(700);
  });
});

describe("sidereal time", () => {
  it("is 280.46 degrees at J2000.0, which is the definition", () => {
    expect(gmstDeg(Date.UTC(2000, 0, 1, 12, 0, 0))).toBeCloseTo(280.460_618, 4);
  });

  it("comes back to itself after one sidereal day, not one solar day", () => {
    const at = Date.UTC(2026, 2, 14, 9, 30, 0);
    // 23h 56m 4.0905s.
    const sidereal = 86_164_090.5;
    expect(gmstDeg(at + sidereal)).toBeCloseTo(gmstDeg(at), 3);
    // A solar day leaves it very nearly a degree further on, which is the whole reason this exists.
    const solarGap = gmstDeg(at + 86_400_000) - gmstDeg(at);
    expect(solarGap).toBeCloseTo(0.985_647, 4);
  });

  it("agrees with the sun, which this file computes no part of", () => {
    /* The real check, and the only one here that could catch a wrong epoch or a sign slip. See ARCHITECTURE.md#srcgeostarstestts. */
    const raOfSun = (at: number): number => (((subsolarPoint(at).lon + gmstDeg(at)) % 360) + 360) % 360;

    let june = { lat: -99, at: 0 };
    let december = { lat: 99, at: 0 };
    let march = { off: 99, at: 0 };
    const start = Date.UTC(2025, 0, 1);
    for (let h = 0; h < 365 * 24; h += 1) {
      const at = start + h * 3_600_000;
      const { lat } = subsolarPoint(at);
      if (lat > june.lat) june = { lat, at };
      if (lat < december.lat) december = { lat, at };
      // The northward crossing, which is the March equinox rather than the September one.
      if (h < 365 * 12 && Math.abs(lat) < march.off) march = { off: Math.abs(lat), at };
    }

    // Signed, because the March answer lands just under 360 and a plain closeness test reads that as
    // the furthest possible miss rather than as zero.
    const wrap = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
    expect(raOfSun(june.at)).toBeCloseTo(90, 0);
    expect(raOfSun(december.at)).toBeCloseTo(270, 0);
    expect(wrap(raOfSun(march.at))).toBeCloseTo(0, 0);
    // And the declinations those were found by, as a check that the scan found what it claims.
    expect(june.lat).toBeCloseTo(23.44, 1);
    expect(december.lat).toBeCloseTo(-23.44, 1);
  });
});

describe("how bright a star is drawn", () => {
  it("puts Sirius at the top and the faintest in the table at the bottom", () => {
    expect(starBrightness(-1.46)).toBeCloseTo(1, 6);
    expect(starBrightness(STAR_MAG_LIMIT)).toBeCloseTo(0, 6);
  });

  it("clamps rather than going negative, so a fainter table cannot invert the ramp", () => {
    expect(starBrightness(9)).toBe(0);
    expect(starBrightness(-30)).toBe(1);
  });

  it("falls as magnitude rises, which is the direction that reads backwards", () => {
    expect(starBrightness(0)).toBeGreaterThan(starBrightness(3));
    expect(starBrightness(3)).toBeGreaterThan(starBrightness(5));
  });
});

describe("placing a star before the sky is turned", () => {
  it("puts right ascension zero on the prime meridian's own axis", () => {
    const [x, y, z] = starVector(0, 0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(1, 6);
  });

  it("puts the pole at the pole", () => {
    expect(starVector(0, 90)[1]).toBeCloseTo(1, 6);
    expect(starVector(123, -90)[1]).toBeCloseTo(-1, 6);
  });

  it("returns unit vectors, since the layer scales them itself", () => {
    for (const [ra, dec] of [
      [0, 0],
      [45, 30],
      [200, -60],
      [359, 89],
    ] as [number, number][]) {
      const [x, y, z] = starVector(ra, dec);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    }
  });
});
