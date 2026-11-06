import { EARTH_RADIUS_KM } from "../geo/sphere";
import type { SourceStatus } from "../sources/types";
import type { Store } from "../data/store";
import type { Filters, Quake, Reading } from "../data/types";
import { matches } from "../data/filter";
import type { RegionCount } from "./regions";
import { compactSpan, depth, place, SOURCE_NAMES } from "./format";
import type { Stop } from "./tour";

function readingStop(quake: Quake, purpose: "largest" | "depth"): Stop {
  const r = quake.primary;
  const value = `${r.scale || "M"} ${r.magnitude.toFixed(1)}`;
  return {
    name: place(r.place),
    lon: r.lon,
    lat: r.lat,
    zoom: purpose === "depth" ? 1.65 : 1.5,
    count: 1,
    key: quake.key,
    purpose,
    heading: purpose === "depth" ? "Far beneath our feet." : "One event. A closer look.",
    description:
      purpose === "depth"
        ? `Reported depth: ${depth(r)} (${SOURCE_NAMES[r.source]}). Guides run every 300 km to 900 km at true scale; faint points are historical seismicity.`
        : `${SOURCE_NAMES[r.source]} reports ${value} near ${place(r.place)}. It was the largest primary reading when this tour began.`,
    reading: r,
  };
}

export interface Journey {
  stops: Stop[];
  deepest: Reading | null;
}

export function journeyFor(
  store: Store,
  filters: Filters,
  now: number,
  regions: readonly RegionCount[],
  revealUntil: number | null = null,
): Journey {
  let largest: Quake | null = null,
    deepest: Quake | null = null,
    count = 0;
  store.forEach((q) => {
    if (!matches(q, filters, now) || (revealUntil !== null && q.primary.time > revealUntil)) return;
    count += 1;
    if (!largest || q.primary.magnitude > largest.primary.magnitude) largest = q;
    if (
      Number.isFinite(q.primary.depthKm) &&
      q.primary.depthKm >= 70 &&
      q.primary.depthKm <= EARTH_RADIUS_KM &&
      (!deepest || q.primary.depthKm > deepest.primary.depthKm)
    )
      deepest = q;
  });
  const stops: Stop[] = [];
  // forEach callbacks cannot narrow these references for TypeScript's outer control-flow analysis.
  const top = largest as Quake | null,
    deep = deepest as Quake | null;
  if (top) stops.push(readingStop(top, "largest"));
  if (deep && deep.key !== top?.key) stops.push(readingStop(deep, "depth"));
  const busiest = [...regions].sort(
    (a, b) => b.count - a.count || a.region.name.localeCompare(b.region.name),
  )[0];
  if (count > 0 && revealUntil === null && busiest && busiest.count > 0)
    stops.push({
      ...busiest.region,
      count: busiest.count,
      purpose: "region",
      heading: "A pattern takes shape.",
      description: `${busiest.count.toLocaleString("en-GB")} events fell in ${busiest.region.name} when the tour began. Plate boundaries provide context; proximity alone does not establish a cause.`,
    });
  if (count > 0)
    stops.push({
      name: "The whole view",
      lon: 145,
      lat: 12,
      zoom: 1,
      count,
      purpose: "overview",
      heading: "A restless planet.",
      description: `This tour began with ${count.toLocaleString("en-GB")} earthquakes in the filtered view. Each mark has a recorded time, location and source. Explore one to see the original accounts.`,
    });
  return { stops, deepest: deep?.primary ?? null };
}

export function observatorySummary({
  count,
  minMagnitude,
  windowMs,
  sources,
  day,
}: {
  count: number;
  minMagnitude: number;
  windowMs: number;
  sources: ReadonlySet<string>;
  day: string | null;
}): string {
  if (sources.size === 0) return "No earthquake feeds selected. Explore to choose a source.";
  const period = day ? `${day} archive` : `last ${compactSpan(windowMs)}`;
  const source = sources.size === 1 ? ` · ${sources.has("usgs") ? "USGS" : "EMSC"} only` : "";
  const event = count === 1 ? "earthquake" : "earthquakes";
  return `${count.toLocaleString("en-GB")} ${event} · M${minMagnitude.toFixed(1)}+ · ${period}${source}`;
}

export function observatoryFeedNote(
  statuses: Record<"usgs" | "emsc", SourceStatus>,
  otherFeeds: string | null,
): string | null {
  const failed = (["usgs", "emsc"] as const)
    .filter((id) => statuses[id].kind === "failing")
    .map((id) => SOURCE_NAMES[id]);
  const earthquakeNote = failed.length
    ? `${failed.join(" and ")} ${failed.length === 1 ? "is" : "are"} not answering. Retrying automatically; Explore for source status.`
    : null;
  return [earthquakeNote, otherFeeds].filter(Boolean).join(" ") || null;
}
