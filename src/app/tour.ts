import { LAT_LIMIT, ZOOM_MIN, ZOOM_MAX } from "../globe/framing";
import type { Reading } from "../data/types";

/* Captured waypoints and their summary labels. See ARCHITECTURE.md#srcapptourts. */

/** Long enough to read the name and the count and look at the globe. */
export const TOUR_DWELL_MS = 6000;

export interface Stop {
  name: string;
  lon: number;
  lat: number;
  zoom: number;
  count: number;
  purpose?: "largest" | "depth" | "region" | "overview";
  heading?: string;
  description?: string;
  key?: string;
  reading?: Reading;
}

export function tourArrivedAt(
  state: { lon: number; lat: number; zoom: number },
  target: { lon: number; lat: number; zoom: number },
): boolean {
  let longitude = Math.abs(state.lon - target.lon) % 360;
  if (longitude > 180) longitude = 360 - longitude;
  const latitude = Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, target.lat));
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, target.zoom));
  return longitude < 4 && Math.abs(state.lat - latitude) < 4 && Math.abs(state.zoom - zoom) < 0.08;
}
