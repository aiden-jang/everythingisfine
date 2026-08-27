import { matches } from "./filter";
import type { Store } from "./store";
import type { Filters } from "./types";

/*
 * The depth bands, and how many events are actually in each one.
 *
 * The constants live here rather than in `events.ts` for the reason the wave speeds live in `geo/waves.ts`:
 * the legend needs them and has no business importing a renderer that drags three.js into the first frame.
 *
 * Why the counts exist at all: the marker's hole was sold as tracing the Wadati-Benioff zone, and a count
 * settles it. In a typical 24-hour window 1 event of 79 is below 300km - one ring on the whole planet. Over
 * seven days it is 14 of 704 and a slab starts to show.
 *
 * So the legend states the counts instead of promising the pattern.
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
