import type { RegionCount } from "./regions";

/*
 * The tour, and the ruling it needed first.
 *
 * Section 13 bans "ambient globe rotation, and perpetual loops on any chrome element", and section 8 gives
 * the reason: motion that means nothing makes all the other motion suspect.
 *
 * The ban is on motion that means nothing, so this is not an exemption - it is the test the rule already
 * states. Every stop is a real place with a real count, the rail names both while the camera is there, it
 * is asked for, it ends, and any interaction kills it. A fixed slideshow of pretty margins would fail.
 *
 * No new authored data: the stops come from `REGIONS` and the order from live counts, so the tour visits
 * wherever today's earthquakes actually are. Under reduced motion `flyTo` is already instant, so this
 * degrades by itself into a sequence of cuts.
 */

/** Long enough to read the name and the count and look at the globe. */
export const TOUR_DWELL_MS = 3500;

/** Six, so a tour is twenty-one seconds rather than forty. The rail's own list is uncapped, because hiding
 * quiet regions there would hide the interesting fact that they are quiet; a tour costs the viewer time per
 * entry, so it stops after the ones worth the trip. */
export const TOUR_MAX_STOPS = 6;

export interface Stop {
  name: string;
  lon: number;
  lat: number;
  zoom: number;
  count: number;
}

/** Where the tour goes, busiest first. Empty when nothing is happening anywhere, which is a real state:
 * the caller offers no tour rather than flying the camera around a planet with nothing on it. */
export function tourStops(
  regions: readonly RegionCount[], max: number = TOUR_MAX_STOPS,
): Stop[] {
  return [...regions]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.region.name.localeCompare(b.region.name))
    .slice(0, max)
    .map(({ region, count }) => ({
      name: region.name, lon: region.lon, lat: region.lat, zoom: region.zoom, count,
    }));
}

/** What the rail says while the camera is there. The narration is what makes the motion mean something. */
export function tourLabel(stop: Stop, index: number, total: number): string {
  // Grouped, like every other figure the app prints. Caught reading "2481 events" in a rail whose
  // headline directly above it said "6,000" - the same slip the still export had.
  const events = `${stop.count.toLocaleString("en-GB")} ${stop.count === 1 ? "event" : "events"}`;
  return `${index + 1} of ${total} · ${stop.name} · ${events}`;
}
