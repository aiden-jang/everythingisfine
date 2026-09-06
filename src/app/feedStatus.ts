import type { SourceId, SourceStatus } from "../sources/types";
import { silentFeeds, type HazardLayer } from "./format";

/** A hazard layer that has not been heard from is not a layer that failed. */
export type LayerAnswer = "pending" | "ok" | "failed";

export interface FeedStatus {
  /** Sources that have delivered, out of every source the app draws from. */
  arrived: number;
  total: number;
  /** Something is still in flight, so a count of what is in would be a count of what is early. */
  settling: boolean;
  /** What went quiet, or null. Pending layers are not named: they have not gone quiet yet. */
  silent: string | null;
  /** What the header says out loud, when it is not showing an archived date instead. */
  phrase: string;
}

/**
 * What the header dot is allowed to claim.
 *
 * It counted `statuses` alone, which holds the two streaming quake feeds and nothing else, so "both
 * feeds live" was a true statement about two sevenths of the planet: storms, fires, floods, volcanoes
 * and the aurora could all be missing behind it.
 */
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
    phrase: settling
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
