import { describe, expect, it } from "vitest";
import { eclipseAt, solarEclipse } from "./eclipse";

describe("the moon's shadow on the Earth", () => {
  /*
   * Checked against published eclipse paths, which is the same trick `moon.test.ts` uses: a dated public
   * fact about where a shadow was, tested against arithmetic that knows nothing about it.
   *
   * **Measured against three of them, and the tolerance is set by the result rather than by hope.**
   *
   *   2024-04-08 total    466 km out, umbra  86 km
   *   2023-10-14 annular  759 km out, umbra -89 km
   *   2017-08-21 total   1006 km out, umbra  26 km
   *
   * The timing is far better than the position: this model's own moment of closest approach lands within
   * two minutes of every published greatest eclipse. The position error is the lunar series' own error
   * passed straight through, very nearly one for one, because the shadow axis pivots about a sun four
   * hundred times further away than the moon - so displacing the moon by 500km displaces the shadow by
   * about 500km. Against a penumbra 3,500km across that is a picture worth drawing. It is not a forecast,
   * and nothing in the app may present it as one.
   */
  it("puts the shadow over Mexico at the 2024 April total eclipse", () => {
    // Greatest eclipse 2024-04-08 18:17 UTC, at 25.3N 104.1W.
    const e = solarEclipse(Date.UTC(2024, 3, 8, 18, 17));
    expect(e.touching).toBe(true);
    const { lon, lat } = eclipseAt(e.centre);
    // Within 5 degrees, which is the 466km measured above with room for the series, not a wide net.
    expect(Math.abs(lat - 25.3)).toBeLessThan(5);
    expect(Math.abs(lon + 104.1)).toBeLessThan(5);
    // Total, so the cone still had width when it arrived.
    expect(e.umbra).toBeGreaterThan(0);
  });

  it("calls the 2023 October eclipse annular, which is the sign of the umbra", () => {
    /*
     * Greatest eclipse 2023-10-14 at 17:59 UTC. The moon was near apogee, so its shadow cone closed
     * before reaching the surface and the sun stayed a ring. Nothing here decides that: it is the
     * difference between the moon's radius and the distance the cone had to cross.
     */
    const e = solarEclipse(Date.UTC(2023, 9, 14, 17, 59));
    expect(e.touching).toBe(true);
    expect(e.umbra).toBeLessThan(0);
  });

  it("says nothing is happening on an ordinary day", () => {
    // A week after a new moon the shadow axis misses the planet by a wide margin.
    const e = solarEclipse(Date.UTC(2024, 3, 15, 12, 0));
    expect(e.touching).toBe(false);
    expect(e.gap).toBeGreaterThan(1.6);
  });

  it("touches on very few days, which is what makes it worth drawing", () => {
    /*
     * A shadow that fell somewhere most days would be a bug, and a cheap one to miss: the arithmetic
     * returns a centre and a radius every time it is asked. Two to five solar eclipses a year is the
     * real rate, so a year of hourly samples should light up on a handful of days and no more.
     */
    const days = new Set<string>();
    const start = Date.UTC(2024, 0, 1);
    for (let h = 0; h < 366 * 24; h += 1) {
      const at = start + h * 3_600_000;
      if (solarEclipse(at).touching) days.add(new Date(at).toISOString().slice(0, 10));
    }
    expect(days.size).toBeGreaterThanOrEqual(2);
    expect(days.size).toBeLessThanOrEqual(8);
    // 2024's two solar eclipses were on 8 April and 2 October.
    expect([...days].some((d) => d.startsWith("2024-04-0"))).toBe(true);
    expect([...days].some((d) => d.startsWith("2024-10-0"))).toBe(true);
  });

  it("keeps the penumbra the size the geometry says", () => {
    // Around 0.55 globe radii, so a partial eclipse is visible over some 3,500km.
    const e = solarEclipse(Date.UTC(2024, 3, 8, 18, 17));
    expect(e.penumbra).toBeGreaterThan(0.45);
    expect(e.penumbra).toBeLessThan(0.65);
    // And the umbra is tiny beside it, which is the whole character of an eclipse.
    expect(e.umbra).toBeLessThan(0.06);
  });

  it("finds each eclipse's maximum at the minute it actually happened", () => {
    /*
     * The half of this that is genuinely accurate, and worth pinning separately from the position.
     *
     * Scanning for the smallest gap finds greatest eclipse without being told when it is, and it lands
     * within two minutes across three eclipses seven years apart. A rate error in any of the mean
     * arguments would show up here long before it showed up in a position.
     */
    for (const [at, name] of [
      [Date.UTC(2024, 3, 8, 18, 17), "2024-04-08"],
      [Date.UTC(2023, 9, 14, 17, 59), "2023-10-14"],
      [Date.UTC(2017, 7, 21, 18, 26), "2017-08-21"],
    ] as [number, string][]) {
      let best = { gap: 9, at };
      for (let s = -4 * 3600; s <= 4 * 3600; s += 30) {
        const gap = solarEclipse(at + s * 1000).gap;
        if (gap < best.gap) best = { gap, at: at + s * 1000 };
      }
      expect(Math.abs(best.at - at) / 60_000, name).toBeLessThan(4);
    }
  });

  it("returns a unit vector, since the shader multiplies it against surface normals", () => {
    for (const at of [Date.UTC(2024, 3, 8, 18, 17), Date.UTC(2024, 6, 1), Date.UTC(2025, 1, 14, 3)]) {
      const [x, y, z] = solarEclipse(at).centre;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    }
  });
});
