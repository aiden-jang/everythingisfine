import { DEG } from "../geo/sphere";

/*
 * Collapsing dense margins into one marker until you zoom in.
 *
 * Chosen over time scrubbing as the second ceiling-raiser because it solves a legibility problem
 * and raises the event ceiling at the same time, and the legibility problem is measured rather than
 * imagined: on a real seed, **149 of 228 events had a neighbour within 40km**. That is why markers
 * in the Ring of Fire render as overlapping crescents rather than as circles.
 *
 * Binned on a longitude/latitude grid rather than by distance. Proper spatial clustering would
 * merge by separation and iterate, which is both slower and worse here: a grid is O(n) with one
 * pass, it is stable frame to frame (distance-based clusters shimmer as membership flips), and
 * stability matters more than optimal grouping when the thing is being watched rather than analysed.
 */

/**
 * Grid cell size in degrees, derived from zoom.
 *
 * Markers hold a constant size on screen, so the number of them that can sit side by side without
 * touching depends only on how many degrees a screen-width covers, which is what zoom describes.
 * Doubling the magnification halves the cell.
 *
 * Above `CLUSTER_UNTIL` nothing is binned at all: by then the surface is spread out enough that
 * every event has room, and collapsing anything would be hiding data for no gain.
 */
export const CLUSTER_UNTIL = 1.9;
const BASE_CELL_DEG = 3.2;

export function cellSizeDeg(zoom: number): number {
  if (zoom >= CLUSTER_UNTIL) return 0;
  return BASE_CELL_DEG / Math.max(0.5, zoom);
}

/**
 * Which cell a point falls in, as a single integer key.
 *
 * Longitude cells widen toward the poles by `1/cos(lat)`. Without that, a cell near the Aleutians
 * covers a fraction of the ground one at the equator does, and the far north stops clustering at
 * exactly the latitude where USGS reports most densely.
 */
export function cellKey(lon: number, lat: number, cell: number): number {
  const latBand = Math.floor((lat + 90) / cell);
  // Clamped, because 1/cos goes to infinity at the pole and one cell would swallow a hemisphere.
  const widen = Math.min(8, 1 / Math.max(0.125, Math.cos(lat * DEG)));
  const lonCell = cell * widen;
  const lonBand = Math.floor((lon + 180) / lonCell);
  // Latitude has at most 180/cell bands, so 4096 leaves room for any cell size worth using.
  return latBand * 4096 + lonBand;
}
