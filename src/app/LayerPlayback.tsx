import type { ReactNode } from "react";
import type { PlaybackLayer } from "./weatherLayers";
import { mapLayerNames } from "./layerVisibility";
import type { FeedRow } from "./feedStatus";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export function LayerPlayback({
  id,
  expanded,
  at,
  state,
  onToggle,
  children,
}: {
  id: PlaybackLayer;
  expanded: boolean;
  at: number | undefined;
  state: FeedRow["state"];
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="layer-playback">
      <button
        id={`${id}-playback-toggle`}
        type="button"
        className="layer-playback-toggle"
        aria-label={`${mapLayerNames[id]} controls`}
        aria-expanded={expanded}
        aria-controls={`${id}-playback-content`}
        aria-describedby={`${id}-playback-time`}
        onClick={onToggle}
      >
        <span>{mapLayerNames[id]}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
          <path d="m2 2 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <small id={`${id}-playback-time`}>
        {state === "failed" ? "Source unavailable" : state === "pending" ? "Checking source…" : ""}
        {at !== undefined && (state === "failed" || state === "pending") ? " · " : ""}
        {at !== undefined ? (
          <time dateTime={new Date(at).toISOString()}>{clock.format(at)} UTC</time>
        ) : state === "ok" ? (
          "No recent data"
        ) : (
          ""
        )}
      </small>
      <div id={`${id}-playback-content`} hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
