import { describe, expect, it } from "vitest";
import { subsolarPoint } from "./sun";

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
