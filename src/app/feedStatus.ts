import type { SourceId, SourceStatus } from "../sources/types";
import { silentFeeds, type HazardLayer } from "./format";

export type LayerAnswer = "pending" | "ok" | "failed";
type FeedKey = SourceId | HazardLayer;
export type FeedChecks = Partial<Record<FeedKey, number>>;

export interface FeedRow {
  id: FeedKey | "radar" | "wind" | "lightning";
  label: string;
  state: LayerAnswer | "off";
  lastCheck: number | undefined;
  message?: string | undefined;
}

const labels: Record<FeedKey, string> = {
  usgs: "USGS earthquakes",
  emsc: "EMSC earthquakes",
  aurora: "NOAA aurora forecast",
  cyclones: "GDACS global cyclones",
  volcanoes: "GDACS volcanoes",
  fires: "GDACS wildfires",
  floods: "GDACS floods",
};

export interface FeedStatus {
  arrived: number;
  total: number;
  settling: boolean;
  silent: string | null;
  phrase: string;
  rows: readonly FeedRow[];
}

export function feedStatus(
  statuses: Record<SourceId, SourceStatus>,
  answered: Record<HazardLayer, LayerAnswer>,
  checks: FeedChecks = {},
  layers: readonly FeedRow[] = [],
): FeedStatus {
  const states: Record<FeedKey, LayerAnswer> = {
    ...answered,
    usgs: statuses.usgs.kind === "live" ? "ok" : statuses.usgs.kind === "idle" ? "pending" : "failed",
    emsc: statuses.emsc.kind === "live" ? "ok" : statuses.emsc.kind === "idle" ? "pending" : "failed",
  };
  const rows: FeedRow[] = (Object.keys(labels) as FeedKey[]).map((id) => ({
    id,
    label: labels[id],
    state: states[id],
    lastCheck: checks[id],
  }));
  rows.push(...layers);
  const arrived = rows.filter(({ state }) => state === "ok").length;
  const total = rows.filter(({ state }) => state !== "off").length;
  const settling = rows.some(({ state }) => state === "pending");
  return {
    arrived,
    total,
    settling,
    rows,
    phrase:
      arrived === 0 && settling
        ? "connecting"
        : arrived === total
          ? "All feeds available"
          : `${arrived} of ${total} feeds available`,
    silent: silentFeeds(
      Object.fromEntries(Object.entries(answered).map(([key, state]) => [key, state !== "failed"])) as Record<
        HazardLayer,
        boolean
      >,
    ),
  };
}
