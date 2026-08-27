import { describe, expect, it } from "vitest";
import { planetPositions } from "./planets";
import { subsolarPoint } from "./sun";
import { DEG } from "./sphere";

/** True angular separation between two bodies given as the points they stand over. */
function apart(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const c = Math.sin(a.lat * DEG) * Math.sin(b.lat * DEG)
    + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lon - a.lon) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
const find = (at: number, name: string): { lon: number; lat: number; magnitude: number } =>
  planetPositions(at).find((p) => p.name === name)!;

describe("where the planets are", () => {
  it("puts Jupiter on Saturn at the 2020 great conjunction", () => {
    /*
     * The best dated test available for this, and it needs two independent orbits to be right at once.
     *
     * On 2020-12-21 Jupiter and Saturn passed about 6 arcminutes apart - the closest since 1623, and
     * close enough that both fitted in a telescope's field. Two elements tables, two Kepler solutions,
     * one answer.
     */
    const at = Date.UTC(2020, 11, 21, 13, 30);
    expect(apart(find(at, "Jupiter"), find(at, "Saturn"))).toBeLessThan(0.5);
  });

  it("keeps the inner planets inside the elongations they can reach", () => {
    /*
     * Mercury never gets more than about 28 degrees from the sun and Venus never more than 47, because
     * their orbits are inside ours. That is a hard geometric ceiling, and a sign error or a swapped
     * element would sail straight past it. Checked every six hours for a year, which covers several
     * elongations of each.
     */
    let mercury = 0;
    let venus = 0;
    const start = Date.UTC(2025, 0, 1);
    for (let h = 0; h < 365 * 24; h += 6) {
      const at = start + h * 3_600_000;
      const sun = subsolarPoint(at);
      mercury = Math.max(mercury, apart(sun, find(at, "Mercury")));
      venus = Math.max(venus, apart(sun, find(at, "Venus")));
    }
    // Reached, so the orbits are moving, and not exceeded, so they are the right size.
    expect(mercury).toBeGreaterThan(17);
    expect(mercury).toBeLessThan(29);
    expect(venus).toBeGreaterThan(43);
    expect(venus).toBeLessThan(48);
  });

  it("lets the outer planets reach opposition, which the inner ones cannot", () => {
    // Mars, Jupiter and Saturn all pass through 180 degrees of elongation. Their whole difference.
    let mars = 0;
    const start = Date.UTC(2024, 0, 1);
    for (let h = 0; h < 2 * 365 * 24; h += 12) {
      const at = start + h * 3_600_000;
      mars = Math.max(mars, apart(subsolarPoint(at), find(at, "Mars")));
    }
    expect(mars).toBeGreaterThan(170);
  });

  it("keeps them all near the ecliptic, where planets live", () => {
    /*
     * None of these orbits is inclined more than about 7 degrees, so none can appear further than roughly
     * the obliquity plus that from the celestial equator. A rotation applied in the wrong order would
     * scatter them over the whole sky and every other test here would still pass.
     */
    const start = Date.UTC(2025, 0, 1);
    for (let h = 0; h < 365 * 24; h += 24) {
      for (const p of planetPositions(start + h * 3_600_000)) {
        expect(Math.abs(p.lat), `${p.name}`).toBeLessThan(31);
      }
    }
  });

  it("swings each planet through the brightness range it really has", () => {
    /*
     * Two years of samples against the published extremes, which is where the phase term earns its place.
     *
     * Without it Venus reached -5.9, brighter than it has ever been, because at inferior conjunction it
     * is closest to us and also a thin crescent - and only one of those two facts was in the arithmetic.
     *
     *   Mercury  -2.30 to  5.61   (real -2.5 to 5.7)
     *   Venus    -4.64 to -3.89   (real -4.9 to -3.8)
     *   Jupiter  -2.82 to -1.89   (real -2.9 to -1.9)
     *   Saturn    0.68 to  1.20   (real  0.6 to  1.2)
     *
     * Mars is left out of the tight bounds below: it runs from -1.4 to 1.6 here, and its true floor of
     * -2.9 needs a perihelic opposition, which does not fall inside this window.
     */
    const lo: Record<string, number> = {};
    const hi: Record<string, number> = {};
    const start = Date.UTC(2024, 0, 1);
    for (let h = 0; h < 2 * 365 * 24; h += 6) {
      for (const p of planetPositions(start + h * 3_600_000)) {
        lo[p.name] = Math.min(lo[p.name] ?? 99, p.magnitude);
        hi[p.name] = Math.max(hi[p.name] ?? -99, p.magnitude);
      }
    }
    // Venus never out-shines its own record, which is the case the phase term was added for.
    expect(lo["Venus"]!).toBeGreaterThan(-4.9);
    expect(lo["Venus"]!).toBeLessThan(-4.3);
    expect(lo["Jupiter"]!).toBeGreaterThan(-3.0);
    expect(lo["Jupiter"]!).toBeLessThan(-2.6);
    // Mercury is the one that genuinely disappears, which nothing else here does.
    expect(hi["Mercury"]!).toBeGreaterThan(4);
    expect(lo["Saturn"]!).toBeGreaterThan(0.3);
    expect(hi["Saturn"]!).toBeLessThan(1.6);
  });

  it("keeps longitude in the range the rest of the globe uses", () => {
    for (const p of planetPositions(Date.UTC(2026, 2, 3, 7, 15))) {
      expect(p.lon, p.name).toBeGreaterThanOrEqual(-180);
      expect(p.lon, p.name).toBeLessThanOrEqual(180);
    }
  });
});
