import { describe, expect, it } from "vitest";
import { buildLand } from "./land";

describe("the land mesh", () => {
  const land = buildLand();

  it("winds every triangle outward, so back-face culling can hide the far side", () => {
    /*
     * The fill is drawn without a depth test, so culling is the only thing hiding the far hemisphere.
     * A triangle wound the wrong way survives on the far side and vanishes on the near one, which
     * reads as the globe being slightly transparent rather than as a bug.
     */
    let inward = 0;
    const p = land.position;
    for (let i = 0; i < land.index.length; i += 3) {
      const a = land.index[i]! * 3;
      const b = land.index[i + 1]! * 3;
      const c = land.index[i + 2]! * 3;
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * p[a]! + ny * p[a + 1]! + nz * p[a + 2]! < 0) inward += 1;
    }
    expect(inward).toBe(0);
  });

  it("had a real problem to fix, rather than a precaution", () => {
    // If the source ever becomes consistent this drops to zero, and the pass above can go.
    expect(land.flipped).toBeGreaterThan(0);
  });
});
