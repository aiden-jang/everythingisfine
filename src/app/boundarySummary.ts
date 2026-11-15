import type { Feed } from "./feed";
import type { Filters, Quake } from "../data/types";
import { matches } from "../data/filter";
import { QUIET_BAND_KM, QUIET_BAND_SHARE } from "../geo/boundaryDistance";
import { quietNote, quietParts } from "./format";

export function boundarySummary(
  store: Feed["store"],
  filters: Filters,
  at: number,
  distance: (quake: Quake) => number | null,
) {
  let near = 0;
  let total = 0;
  store.forEach((quake) => {
    if (!matches(quake, filters, at)) return;
    total += 1;
    const km = distance(quake);
    if (km !== null && km <= QUIET_BAND_KM) near += 1;
  });
  // The area share uses a cos-weighted grid, not an unweighted count of cells.
  return {
    note: quietNote(near, total, QUIET_BAND_KM, QUIET_BAND_SHARE),
    parts: quietParts(near, total, QUIET_BAND_SHARE),
  };
}
