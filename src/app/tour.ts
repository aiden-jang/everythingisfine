import type { RegionCount } from "./regions";

/*
 * The tour, and the ruling it needed first.
 *
 * PLAN.local.md gated this behind a DESIGN.md decision, paraphrasing the rule as a ban on rotation "even
 * when a person starts it". The rule itself says something narrower. Section 13 bans "**Ambient** globe
 * rotation, and perpetual loops on any chrome element", and section 8 gives the reason in full: "this
 * product's entire claim is 'this is happening right now'. A pulsing chrome element is motion that means
 * nothing, and the moment a viewer sees motion that means nothing, all the other motion becomes suspect."
 *
 * **The ban is on motion that means nothing.** So the ruling is not an exemption, it is the test the rule
 * already states, and a tour passes it only if it is built to: every stop is a real place with a real
 * count, the rail names both while the camera is there, it is asked for, it ends, and any interaction kills
 * it. The entrance replay is the precedent and it is stricter about the same thing - it animates only
 * *when the app chooses to draw* data it already has, and invents nothing.
 *
 * What would have failed the test: a fixed slideshow of pretty margins. That is a screensaver, and it
 * would have carried the app's one claim into a place where it was not true.
 *
 * **No new authored data.** The stops come from `REGIONS`, which the rail already flies to, and the order
 * comes from live counts. So the tour visits wherever today's earthquakes actually are, busiest first, and
 * a quiet margin is simply not on it. Under reduced motion `flyTo` is already instant, so this degrades by
 * itself into a sequence of cuts with no camera travel at all, which is the correct nothing.
 */

/** Long enough to read the name and the count and look at the globe. */
export const TOUR_DWELL_MS = 3500;

/**
 * Six, so a tour is twenty-one seconds rather than forty.
 *
 * The rail's own list is deliberately uncapped, because hiding quiet regions there would hide the
 * interesting fact that they are quiet. A tour is the opposite kind of thing: it costs the viewer time per
 * entry, so it stops after the ones worth the trip.
 */
export const TOUR_MAX_STOPS = 6;

export interface Stop {
  name: string;
  lon: number;
  lat: number;
  zoom: number;
  count: number;
}

/**
 * Where the tour goes, busiest first.
 *
 * Empty when nothing is happening anywhere, which is a real state and not an error: the caller offers no
 * tour rather than flying the camera around a planet with nothing on it.
 */
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
