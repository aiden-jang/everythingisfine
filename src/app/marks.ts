import { flame, spiral, volcano, waves, type Point } from "../globe/shapes";
import type { Cyclone } from "../sources/cyclones";
import type { Flood } from "../sources/floods";
import type { Volcano } from "../sources/volcanoes";
import type { Wildfire } from "../sources/wildfires";

/*
 * Which shapes exist, from what is happening.
 *
 * The one place that knows both the phenomena and the glyphs, so the scene can take polylines and know
 * nothing about storms or fires, and `shapes.ts` can draw outlines and know nothing about feeds.
 *
 * Four outlines, no hue between them: a spiral is a storm, a triangle a volcano, a flame a fire, three
 * wavy lines a flood. That is the rule the aurora set - light gets colour, marks get shapes - and it is
 * what lets five layers share a globe without any of them borrowing the magnitude ramp.
 */

export interface Happening {
  cyclones: readonly Cyclone[];
  volcanoes: readonly Volcano[];
  fires: readonly Wildfire[];
  floods: readonly Flood[];
}

export function marksFor(
  { cyclones, volcanoes, fires, floods }: Happening,
): readonly (readonly Point[])[] {
  const out: (readonly Point[])[] = [];
  // A cyclone is where it has been plus where it is; the others are a mark on one place.
  for (const storm of cyclones) {
    if (storm.track.length > 1) out.push(storm.track);
    out.push(spiral(storm.lon, storm.lat));
  }
  for (const v of volcanoes) out.push(volcano(v.lon, v.lat));
  for (const f of fires) out.push(flame(f.lon, f.lat));
  // Three strokes each, which is why this one spreads rather than pushes.
  for (const f of floods) out.push(...waves(f.lon, f.lat));
  return out;
}
