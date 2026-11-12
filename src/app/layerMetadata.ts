import type { FeedRow } from "./feedStatus";
import type { MapLayer } from "./layerVisibility";

export const layerMetadata: Record<
  MapLayer,
  { sources: FeedRow["id"][]; coverage: string; meaning: string }
> = {
  earthquakes: {
    sources: ["usgs", "emsc"],
    coverage: "Global reports",
    meaning:
      "Reported earthquakes in the chosen window. Color and size show magnitude; depth uses shape. Agency coverage can be incomplete.",
  },
  cyclones: {
    sources: ["cyclones"],
    coverage: "Global tracks",
    meaning:
      "Reported tropical cyclone tracks, not rainfall radar. Select a storm for its track times and source.",
  },
  fires: {
    sources: ["fires"],
    coverage: "Reported fires",
    meaning: "Reported wildfire events, not every active fire or a live fire boundary.",
  },
  floods: {
    sources: ["floods"],
    coverage: "Reported floods",
    meaning: "Reported flood events, not a map of every flooded area.",
  },
  volcanoes: {
    sources: ["volcanoes"],
    coverage: "Eruption episodes",
    meaning: "Reported eruption episodes. A marker does not mean a volcano is erupting at this instant.",
  },
  aurora: {
    sources: ["aurora"],
    coverage: "Polar forecast",
    meaning:
      "Forecast auroral activity, not a guarantee of visibility. Clouds and local light affect what you can see.",
  },
  radar: {
    sources: ["radar"],
    coverage: "Recent scans · worldwide network",
    meaning:
      "Observed radar returns where participating networks provide coverage. Stripes indicate no listed coverage; blank does not always mean dry.",
  },
  wind: {
    sources: ["wind"],
    coverage: "Global forecast · 10 m above surface",
    meaning:
      "Sampled, modeled surface wind. Streaks show direction; animation speed does not measure wind speed.",
  },
  lightning: {
    sources: ["lightning"],
    coverage: "Satellite detections · GOES-East coverage",
    meaning:
      "Selected satellite lightning scans within GOES-East coverage. No dots does not establish an absence of lightning.",
  },
};

export function layerHealth(layer: MapLayer, rows: readonly FeedRow[]): string | null {
  const sources = rows.filter(({ id }) => layerMetadata[layer].sources.includes(id));
  if (!sources.length) return null;
  if (sources.every(({ state }) => state === "failed")) return "Feed unavailable";
  if (sources.some(({ state }) => state === "failed")) return "Partial source availability";
  if (sources.some(({ state }) => state === "pending")) return "Checking source…";
  return sources.find(({ message }) => message)?.message ?? null;
}
