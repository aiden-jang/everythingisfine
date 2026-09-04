import { describe, expect, it } from "vitest";
import table from "./figures.json";
import type { FigureTable } from "./stars";
import starTable from "./stars.json";

const figures = table as FigureTable;
const stars = starTable as readonly number[];

describe("the constellation figures", () => {
  it("is a list of polylines, each a run of coordinate pairs", () => {
    expect(figures.length).toBeGreaterThan(100);
    for (const [i, line] of figures.entries()) {
      expect(line.length % 2, `polyline ${i} has an odd number of numbers`).toBe(0);
      // Two points is the shortest thing that is a line at all.
      expect(line.length, `polyline ${i} is not a line`).toBeGreaterThanOrEqual(4);
    }
  });

  it("stays inside the celestial coordinate system", () => {
    for (const [i, line] of figures.entries()) {
      for (let k = 0; k < line.length; k += 2) {
        expect(Math.abs(line[k]!), `polyline ${i} right ascension`).toBeLessThanOrEqual(360);
        expect(Math.abs(line[k + 1]!), `polyline ${i} declination`).toBeLessThanOrEqual(90);
      }
    }
  });

  it("draws Orion's belt, which is the figure anybody would check first", () => {
    /* Alnilam, the middle star of the belt, is at 84.05, -1.20. See ARCHITECTURE.md. */
    const touches = figures.some((line) => {
      for (let k = 0; k < line.length; k += 2) {
        if (Math.abs(line[k]! - 84.05) < 0.5 && Math.abs(line[k + 1]! + 1.2) < 0.5) return true;
      }
      return false;
    });
    expect(touches).toBe(true);
  });

  it("ends its lines on stars the app actually draws", () => {
    /*
     * The lines and the stars come from different sources - d3-celestial and the Yale catalogue - so nothing
     * structural guarantees they agree, and if they did not the figures would hang in the gaps between stars.
     *
     * Checked as a proportion, because a few vertices are deliberate bends rather than stars.
     */
    let near = 0;
    let total = 0;
    for (const line of figures) {
      for (let k = 0; k < line.length; k += 2) {
        const ra = ((line[k]! % 360) + 360) % 360;
        const dec = line[k + 1]!;
        total += 1;
        for (let s = 0; s < stars.length; s += 3) {
          if (Math.abs(stars[s + 1]! - dec) > 0.2) continue;
          let dRa = Math.abs(stars[s]! - ra);
          if (dRa > 180) dRa = 360 - dRa;
          if (dRa * Math.cos(dec * (Math.PI / 180)) < 0.2) {
            near += 1;
            break;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(500);
    expect(near / total).toBeGreaterThan(0.9);
  });
});
