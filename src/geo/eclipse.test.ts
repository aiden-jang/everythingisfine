import { describe, expect, it } from "vitest";
import { eclipseAt, lunarEclipse, solarEclipse } from "./eclipse";

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

describe("the Earth's shadow on the moon", () => {
  it("swallows the moon whole at the September 2025 total lunar eclipse", () => {
    // Greatest eclipse 2025-09-07 at 18:11 UTC, a total one lasting 82 minutes.
    const e = lunarEclipse(Date.UTC(2025, 8, 7, 18, 11));
    expect(e.umbral).toBe(1);
    expect(e.penumbral).toBe(true);
  });

  it("comes out mid-range at a deep partial, which is the case worth having", () => {
    /*
     * 2019-07-16 21:31 UTC, umbral magnitude 0.65 in reality and 0.39 here. The value is not the claim -
     * the claim is that a partial reads as a partial, because a model returning only 0 or 1 would pass
     * every other test in this block and still be unable to draw one.
     *
     * **Measured across five real lunar eclipses, and the resolution limit is real:**
     *
     *   2025-09-07 total    mag 1.36 -> 1.00
     *   2021-11-19 partial  mag 0.97 -> 1.00   saturates
     *   2019-07-16 partial  mag 0.65 -> 0.39
     *   2023-10-28 partial  mag 0.12 -> 0.00   missed
     *   2024-09-18 partial  mag 0.09 -> 0.00   missed
     *
     * Anything shallower than about 0.15 is beyond it, because the moon's position is good to roughly
     * 0.08 globe radii perpendicular to the axis and that is 29% of the moon's own radius. `penumbral`
     * still comes back true for those, which is the honest amount to say about them.
     */
    const e = lunarEclipse(Date.UTC(2019, 6, 16, 21, 31));
    expect(e.umbral).toBeGreaterThan(0.1);
    expect(e.umbral).toBeLessThan(0.9);
  });

  it("says nothing at a new moon, when the moon is on the wrong side entirely", () => {
    /*
     * The case a distance-from-the-axis test alone gets exactly backwards. At a new moon the moon sits
     * almost on the sun-Earth line and its offset is tiny, which reads as a total eclipse unless the sign
     * of the position along the axis is checked. 2024-04-08 is the solar eclipse, so it is the extreme.
     */
    const e = lunarEclipse(Date.UTC(2024, 3, 8, 18, 17));
    expect(e.umbral).toBe(0);
    expect(e.penumbral).toBe(false);
  });

  it("happens on a couple of days a year and no more", () => {
    const days = new Set<string>();
    const start = Date.UTC(2025, 0, 1);
    for (let h = 0; h < 365 * 24; h += 1) {
      const at = start + h * 3_600_000;
      if (lunarEclipse(at).umbral > 0) days.add(new Date(at).toISOString().slice(0, 10));
    }
    // 2025 had two umbral lunar eclipses: 13-14 March and 7-8 September.
    expect(days.size).toBeGreaterThanOrEqual(2);
    expect(days.size).toBeLessThanOrEqual(6);
    expect([...days].some((d) => d.startsWith("2025-03-1"))).toBe(true);
    expect([...days].some((d) => d.startsWith("2025-09-0"))).toBe(true);
  });
});

describe("the two shadows cannot both be falling", () => {
  /*
   * The case the browser found and this file missed.
   *
   * A solar eclipse needs the moon between the sun and the Earth; a lunar one needs it on the far side.
   * Checking only how near the axis passes to the Earth's centre cannot tell those apart, because at full
   * moon the three bodies are almost in a line as well - just in the other order. The first version
   * reported a total solar eclipse, centred on the subsolar point, during every lunar eclipse.
   */
  it("reports no solar eclipse during a total lunar eclipse", () => {
    const at = Date.UTC(2025, 8, 7, 18, 11);
    expect(lunarEclipse(at).umbral).toBe(1);
    expect(solarEclipse(at).touching).toBe(false);
  });

  it("reports no lunar eclipse during a total solar eclipse", () => {
    const at = Date.UTC(2024, 3, 8, 18, 17);
    expect(solarEclipse(at).touching).toBe(true);
    expect(lunarEclipse(at).umbral).toBe(0);
  });

  it("never has both at once, across three years of hourly samples", () => {
    const start = Date.UTC(2023, 0, 1);
    for (let h = 0; h < 3 * 365 * 24; h += 1) {
      const at = start + h * 3_600_000;
      const both = solarEclipse(at).touching && lunarEclipse(at).umbral > 0;
      expect(both, new Date(at).toISOString()).toBe(false);
    }
  });
});
