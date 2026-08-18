import plates from "./plates.json";
import { toVec3, spanDeg } from "./sphere";

/*
 * The tectonic plate boundaries.
 *
 * The earthquakes were always tracing these, and nothing on screen said so. A viewer could see that
 * events fall in lines and had no way to know the lines are the edges of the plates: the Ring of
 * Fire read as a coincidence of where dots happen to land rather than as the thing it is. Drawing
 * the boundaries turns the globe's main pattern from something you notice into something you
 * understand, and it costs one static geometry that never changes.
 *
 * PB2002, Bird (2003), public domain. Simplified with Douglas-Peucker at 0.15 degrees, which at the
 * framing shot is under a pixel, and quantised to two decimals. 6,292 vertices become 1,872, and
 * 221kB becomes 9.4kB gzipped, which fits the geometry budget beside the coastlines.
 */

/** Between the graticule and the land, so continents sit on top of the boundaries they contain. */
export const RADIUS_PLATES = 1.0035;

/** Beyond this a segment is a wrap across the antimeridian rather than a real edge. */
const WRAP_DEG = 170;

/**
 * Boundaries as line segment pairs on the sphere.
 *
 * Segments are densified for the same reason the coastlines are: a straight chord between two
 * points 5 degrees apart cuts visibly inside the sphere, and the plate lines run long and straight
 * across open ocean where that is most obvious.
 */
export function buildPlates(): Float32Array {
  const out: number[] = [];
  const DENSIFY_DEG = 1.5;

  for (const line of plates as [number, number][][]) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      // A boundary that leaves at +180 and re-enters at -180 is one line in the source data, and
      // joining those two points draws a chord straight through the planet.
      if (Math.abs(b[0] - a[0]) > WRAP_DEG) continue;

      const steps = Math.max(1, Math.ceil(spanDeg(a[0], a[1], b[0], b[1]) / DENSIFY_DEG));
      for (let s = 0; s < steps; s += 1) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        out.push(
          ...toVec3(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, RADIUS_PLATES),
          ...toVec3(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, RADIUS_PLATES),
        );
      }
    }
  }
  return new Float32Array(out);
}
