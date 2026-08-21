import { spiral, volcano, type Point } from "../globe/shapes";
import type { Cyclone } from "../sources/cyclones";
import type { Volcano } from "../sources/volcanoes";

/*
 * Which shapes exist, from what is happening.
 *
 * The one place that knows both the phenomena and the glyphs, so the scene can take polylines and know
 * nothing about storms, and `shapes.ts` can draw outlines and know nothing about feeds.
 */

/** A cyclone is where it has been plus where it is; a volcano is a triangle on the mountain. */
export function marksFor(
  cyclones: readonly Cyclone[], volcanoes: readonly Volcano[],
): readonly (readonly Point[])[] {
  const out: (readonly Point[])[] = [];
  for (const storm of cyclones) {
    if (storm.track.length > 1) out.push(storm.track);
    out.push(spiral(storm.lon, storm.lat));
  }
  for (const v of volcanoes) out.push(volcano(v.lon, v.lat));
  return out;
}
