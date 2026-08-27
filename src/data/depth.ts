import { matches } from "./filter";
import type { Store } from "./store";
import type { Filters } from "./types";

/*
 * The depth bands, and how many events are in each.
 *
 * The constants live here, not in `events.ts`, so the legend can import them without dragging three.js into
 * the first frame.
 *
 * The counts exist because the hole in a marker was oversold as tracing a slab: in a typical day 1 event of
 * 79 is below 300km, which is one ring on the whole planet. Over seven days it is 14 of 704. So the legend
 * prints the counts instead of promising the pattern.
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
