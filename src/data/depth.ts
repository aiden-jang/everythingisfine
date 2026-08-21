import { matches } from "./filter";
import type { Store } from "./store";
import type { Filters } from "./types";

/*
 * The depth bands, and how many events are actually in each one.
 *
 * The constants live here rather than in `events.ts` for the reason the wave speeds live in `geo/waves.ts`:
 * these are facts about earthquakes, the legend needs them, and the legend has no business importing a
 * renderer that drags three.js into the bundle that paints the first frame.
 *
 * **Why the counts exist at all.** `events.ts` carves a hole in a marker in proportion to depth and its
 * comment claimed the payoff: along a subduction margin "solid dots at the trench giving way to rings
 * inland ... that is the Wadati-Benioff zone". The encoding is real and that reading was oversold, which
 * a count settles: in a typical 24-hour window **1 event of 79 is below 300km** - 1.3%, one ring on the
 * whole planet, which traces nothing. Over seven days it is 14 of 704, and a slab starts to show.
 *
 * So the legend states the counts instead of promising the pattern. It is the same move the corroboration
 * note made: replace a claim about what the viewer will see with the number that says whether they can.
 */

/** Above this an event is shallow, and shallow events do the damage. */
export const DEPTH_SHALLOW_KM = 70;
/** Below this an event is inside a descending slab, and the marker is a ring. */
export const DEPTH_DEEP_KM = 300;

export interface DepthBands {
  shallow: number;
  intermediate: number;
  deep: number;
  /** Depth is not always given, and zero is a real seabed value that cannot stand in for missing. */
  unknown: number;
  total: number;
}

export function depthBands(store: Store, filters: Filters, now: number): DepthBands {
  const bands: DepthBands = { shallow: 0, intermediate: 0, deep: 0, unknown: 0, total: 0 };
  store.forEach((quake) => {
    if (!matches(quake, filters, now)) return;
    bands.total += 1;
    const km = quake.primary.depthKm;
    if (!Number.isFinite(km)) bands.unknown += 1;
    else if (km < DEPTH_SHALLOW_KM) bands.shallow += 1;
    else if (km < DEPTH_DEEP_KM) bands.intermediate += 1;
    else bands.deep += 1;
  });
  return bands;
}
