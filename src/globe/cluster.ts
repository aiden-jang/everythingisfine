import { DEG } from "../geo/sphere";

/* Collapses dense margins into one marker until you zoom in. Measured: on a real seed, 149 of 228 events
   had a neighbour within 40km, which is why the Ring of Fire renders as overlapping crescents. See
   ARCHITECTURE.md. */

/**
 * Grid cell size in degrees, derived from zoom. Markers hold a constant size on screen, so how many can
 * sit side by side depends only on how many degrees a screen-width covers. See ARCHITECTURE.md#srcglobeclusterts.
 */
export const CLUSTER_UNTIL = 2.2;
const BASE_CELL_DEG = 4;

export function cellSizeDeg(zoom: number): number {
  if (zoom >= CLUSTER_UNTIL) return 0;
  return BASE_CELL_DEG / Math.max(0.5, zoom);
}

/**
 * Which cell a point falls in, as a single integer key. Longitude cells widen toward the poles by `1/cos(lat)`.
 * Without that, the far north stops clustering at exactly the latitude where USGS reports most densely.
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
