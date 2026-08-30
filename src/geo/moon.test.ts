import { describe, expect, it } from "vitest";
import { DEG } from "./sphere";
import { moonPosition, moonRadii, MOON_RADIUS_KM } from "./moon";
import { subsolarPoint } from "./sun";

/** True angular separation between two points given as geographic longitude and latitude. */
function separation(
  aLon: number, aLat: number, bLon: number, bLat: number,
): number {
  const c = Math.sin(aLat * DEG) * Math.sin(bLat * DEG)
    + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.cos((bLon - aLon) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

const sunMoonGap = (at: number): number => {
  const sun = subsolarPoint(at);
  const moon = moonPosition(at);
  return separation(sun.lon, sun.lat, moon.lon, moon.lat);
};

describe("where the moon is", () => {
  /* Checked against eclipses, which is the only way to test a lunar position without shipping a second
     ephemeris to test the first against. See ARCHITECTURE.md. */
  it("puts the moon on the sun during the April 2024 total solar eclipse", () => {
    // Greatest eclipse 2024-04-08 at 18:17 UTC. Geocentrically the two centres nearly coincide.
    const gap = sunMoonGap(Date.UTC(2024, 3, 8, 18, 17));
    expect(gap).toBeLessThan(1);
  });

  it("puts it opposite the sun during the September 2025 total lunar eclipse", () => {
    // Greatest eclipse 2025-09-07 at 18:11 UTC, so the moon is in the Earth's shadow: 180 degrees away.
    const gap = sunMoonGap(Date.UTC(2025, 8, 7, 18, 11));
    expect(gap).toBeGreaterThan(179);
  });

  it("is nowhere near the sun at a first quarter, which is the same test the other way", () => {
    // 2024-04-15 19:13 UTC was a first quarter: half lit, so 90 degrees of elongation.
    expect(sunMoonGap(Date.UTC(2024, 3, 15, 19, 13))).toBeCloseTo(90, -0.5);
  });

  it("comes back to the sun a synodic month later, and the month is the right length", () => {
    /* Successive new moons, found by minimising the elongation rather than by being told when they are. See
       ARCHITECTURE.md. */
    const newMoons: number[] = [];
    let previous = -1;
    let last = 999;
    let falling = true;
    for (let h = 0; h < 5 * 365 * 24; h += 1) {
      const at = Date.UTC(2025, 0, 1) + h * 3_600_000;
      const gap = sunMoonGap(at);
      if (falling && gap > last) {
        // Just passed a minimum.
        if (previous > 0) newMoons.push(at - previous);
        previous = at;
        falling = false;
      } else if (gap < last) {
        falling = true;
      }
      last = gap;
    }
    expect(newMoons.length).toBeGreaterThanOrEqual(60);
    const mean = newMoons.reduce((s, v) => s + v, 0) / newMoons.length / 86_400_000;
    expect(mean).toBeCloseTo(29.530_588, 1);
  });

  it("stays inside the distances the moon actually reaches", () => {
    // Perigee and apogee over a long span: 356,400km and 406,700km, with room for this series' error.
    let low = Infinity;
    let high = -Infinity;
    for (let h = 0; h < 3 * 365 * 24; h += 3) {
      const { distanceKm } = moonPosition(Date.UTC(2024, 0, 1) + h * 3_600_000);
      low = Math.min(low, distanceKm);
      high = Math.max(high, distanceKm);
    }
    expect(low).toBeGreaterThan(352_000);
    expect(low).toBeLessThan(362_000);
    expect(high).toBeGreaterThan(402_000);
    expect(high).toBeLessThan(411_000);
  });

  it("stays inside the band the moon's orbit allows", () => {
    // The moon's declination cannot exceed the obliquity plus its orbital inclination, 23.44 + 5.15, and over
    // nearly a full 18.6-year nodal cycle it should get close to that ceiling and never past it.
    let extreme = 0;
    for (let d = 0; d < 19 * 365; d += 1) {
      const { lat } = moonPosition(Date.UTC(2020, 0, 1) + d * 86_400_000);
      extreme = Math.max(extreme, Math.abs(lat));
    }
    expect(extreme).toBeLessThan(28.8);
    expect(extreme).toBeGreaterThan(28);
  });

  it("keeps longitude in the range the rest of the globe uses", () => {
    for (let h = 0; h < 60 * 24; h += 7) {
      const { lon } = moonPosition(Date.UTC(2026, 0, 1) + h * 3_600_000);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });

  it("is a quarter of a globe radius across, sixty radii away", () => {
    // The two numbers that let it be drawn at its real size rather than a chosen one.
    expect(moonRadii(MOON_RADIUS_KM)).toBeCloseTo(0.273, 3);
    expect(moonRadii(384_400)).toBeCloseTo(60.3, 1);
    // Which comes out at the half a degree wide that the moon is.
    const apparent = 2 * Math.atan(moonRadii(MOON_RADIUS_KM) / moonRadii(384_400)) / DEG;
    expect(apparent).toBeCloseTo(0.518, 2);
  });
});
