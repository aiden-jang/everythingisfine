import type { SourceId, SourceStatus } from "../sources/types";
import { silentFeeds, type HazardLayer } from "./format";

/** A hazard layer that has not been heard from is not a layer that failed. */
export type LayerAnswer = "pending" | "ok" | "failed";

export interface FeedStatus {
  arrived: number;
  total: number;
  /** Something is still in flight, so a count of what is in is a count of what is early. */
  settling: boolean;
  /** What went quiet, or null. Pending layers are not named: they have not gone quiet yet. */
  silent: string | null;
  phrase: string;
}

/** `statuses` holds the two streaming quake feeds only; the other five layers are in `answered`. */
export function feedStatus(
  statuses: Record<SourceId, SourceStatus>,
  answered: Record<HazardLayer, LayerAnswer>,
): FeedStatus {
  const streams = Object.values(statuses);
  const layers = Object.values(answered);
  const arrived = streams.filter((s) => s.kind === "live").length + layers.filter((a) => a === "ok").length;
  // Counted, not written down, so adding a source cannot leave the phrase claiming the old total.
  const total = streams.length + layers.length;
  const settling = streams.some((s) => s.kind === "idle") || layers.some((a) => a === "pending");
  return {
    arrived,
    total,
    settling,
    /* "connecting" only while nothing at all has arrived. The hazard layers come from GDACS, which
       routinely takes ten to eighteen seconds, and letting the slowest source own the words meant the
       header disowned a planet already covered in earthquakes. The dot still blinks until all are in. */
    phrase:
      arrived === 0
        ? "connecting"
        : arrived === total
          ? "all feeds live"
          : `${arrived} of ${total} feeds live`,
    silent: silentFeeds(
      Object.fromEntries(Object.entries(answered).map(([k, v]) => [k, v !== "failed"])) as Record<
        HazardLayer,
        boolean
      >,
    ),
  };
}
