import { describe, expect, it } from "vitest";
import { daylight, solarClock, solarHour, subsolarPoint, sunElevation } from "./sun";

/*
 * Checked against the astronomical facts rather than against itself, which is the only way a formula
 * this opaque can be tested: a golden value copied from a first run pins whatever it did wrong.
 */
describe("the subsolar point", () => {
  it("sits on the tropics at the solstices", () => {
    const june = subsolarPoint(Date.UTC(2025, 5, 21, 12, 0, 0));
    const december = subsolarPoint(Date.UTC(2025, 11, 21, 12, 0, 0));
    // The tropics are at 23.44 by definition, which is where the sun reaches at each solstice.
    expect(june.lat).toBeCloseTo(23.44, 1);
    expect(december.lat).toBeCloseTo(-23.44, 1);
  });

  it("crosses the equator at the equinoxes", () => {
    expect(subsolarPoint(Date.UTC(2025, 2, 20, 9, 1, 0)).lat).toBeCloseTo(0, 1);
    expect(subsolarPoint(Date.UTC(2025, 8, 22, 18, 19, 0)).lat).toBeCloseTo(0, 1);
  });

  it("tracks Greenwich at UTC noon, offset by the equation of time", () => {
    /*
     * The sign is the whole point of this test, and it is the one I got backwards first.
     *
     * In early November apparent solar time runs about 16 minutes ahead of mean, so by 12:00 UTC the
     * sun has *already* crossed the Greenwich meridian and sits four degrees west of it. In February
     * it runs behind, so at the same clock time it has not arrived yet and sits east.
     */
    expect(subsolarPoint(Date.UTC(2025, 10, 3, 12, 0, 0)).lon).toBeCloseTo(-4.1, 0);
    expect(subsolarPoint(Date.UTC(2025, 1, 11, 12, 0, 0)).lon).toBeCloseTo(3.5, 0);
  });

  it("moves fifteen degrees west per hour", () => {
    const noon = subsolarPoint(Date.UTC(2025, 5, 15, 12, 0, 0));
    const later = subsolarPoint(Date.UTC(2025, 5, 15, 15, 0, 0));
    let moved = noon.lon - later.lon;
    moved -= Math.round(moved / 360) * 360;
    expect(moved).toBeCloseTo(45, 0);
  });

  it("stays inside the tropics and on the globe, all year", () => {
    for (let day = 0; day < 365; day += 7) {
      const p = subsolarPoint(Date.UTC(2025, 0, 1) + day * 86_400_000 + 7 * 3_600_000);
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(23.45);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThan(180);
    }
  });
});

describe("what it was like there, then", () => {
  /*
   * Anchored on the subsolar point rather than on hardcoded expectations, because the whole value of
   * using `subsolarPoint` is that it already carries the equation of time. Restating times computed by
   * hand would be testing my arithmetic against itself.
   */
  const at = Date.UTC(2026, 2, 15, 6, 40, 0);

  it("is noon exactly where the sun is overhead", () => {
    const sub = subsolarPoint(at);
    expect(solarHour(sub.lon, at)).toBeCloseTo(12, 6);
  });

  it("gains an hour every fifteen degrees east", () => {
    const sub = subsolarPoint(at);
    expect(solarHour(sub.lon + 15, at)).toBeCloseTo(13, 6);
    expect(solarHour(sub.lon - 15, at)).toBeCloseTo(11, 6);
    expect(solarHour(sub.lon + 45, at)).toBeCloseTo(15, 6);
  });

  it("is midnight on the far side of the world from the sun", () => {
    const sub = subsolarPoint(at);
    expect(solarHour(sub.lon + 180, at)).toBeCloseTo(0, 6);
  });

  it("wraps rather than reading a day out across the antimeridian", () => {
    // A point either side of 180 must not differ by 24 hours because of how the subtraction landed.
    const a = solarHour(179.5, at);
    const b = solarHour(-179.5, at);
    const gap = Math.abs(a - b);
    expect(Math.min(gap, 24 - gap)).toBeLessThan(0.1);
  });

  it("stays inside a day for any longitude", () => {
    for (const lon of [-180, -90, -0.001, 0, 60, 179.999, 180]) {
      const h = solarHour(lon, at);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
    }
  });

  it("puts the sun overhead at the subsolar point and underfoot opposite it", () => {
    const sub = subsolarPoint(at);
    expect(sunElevation(sub.lon, sub.lat, at)).toBeCloseTo(90, 4);
    expect(sunElevation(sub.lon + 180, -sub.lat, at)).toBeCloseTo(-90, 4);
  });

  it("puts the horizon ninety degrees away from the sun, which is the terminator", () => {
    const sub = subsolarPoint(at);
    /*
     * On the equator, where a quarter turn of longitude really is a quarter turn of arc whatever the
     * declination: cos(z) collapses to cos(dec) times cos(90), which is zero exactly.
     *
     * At the subsolar latitude instead it is asin(sin squared dec), which is 0.08 degrees in March and
     * zero only at an equinox. That was this test's first version, and the formula was right.
     */
    expect(sunElevation(sub.lon + 90, 0, at)).toBeCloseTo(0, 6);
    expect(sunElevation(sub.lon - 90, 0, at)).toBeCloseTo(0, 6);
  });

  it("bands on the same six degrees the night shader spreads its terminator over", () => {
    expect(daylight(12)).toBe("daylight");
    expect(daylight(0.1)).toBe("daylight");
    expect(daylight(-0.1)).toBe("twilight");
    expect(daylight(-5.9)).toBe("twilight");
    expect(daylight(-6.1)).toBe("dark");
  });

  it("reads a polar summer as daylight at three in the morning, which it is", () => {
    /*
     * The reason the band comes off elevation and not off the hour. Northern midsummer inside the
     * Arctic circle: the small hours are broad daylight, and a rule reading the clock would say dark.
     */
    const midsummer = Date.UTC(2026, 5, 21, 12, 0, 0);
    const lon = subsolarPoint(midsummer).lon + 180;
    expect(solarHour(lon, midsummer)).toBeCloseTo(0, 3);
    expect(daylight(sunElevation(lon, 78, midsummer))).toBe("daylight");
  });

  it("formats an hour as a clock, and never as 24:00", () => {
    expect(solarClock(3.2)).toBe("03:12");
    expect(solarClock(0)).toBe("00:00");
    expect(solarClock(13.5)).toBe("13:30");
    // 23:59:40 rounds up to the next day rather than to a time that does not exist.
    expect(solarClock(23.9999)).toBe("00:00");
  });
});
