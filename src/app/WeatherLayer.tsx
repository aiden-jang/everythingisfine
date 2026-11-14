import { PlaybackButton } from "./PlaybackButton";
import { layerTime } from "./layerTime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { loadSource } from "./observations/load";
import { observations } from "./observations/catalogue";
import type { ObservationSource } from "./observations/types";
import { useObservationData } from "./observations/useObservationData";
import {
  weatherLayers,
  weatherFrame,
  weatherFeed,
  type WeatherLayerId,
  type WeatherLayerView,
} from "./weatherLayers";

type Props = {
  id: WeatherLayerId;
  suspended: boolean;
  onView: (id: WeatherLayerId, view: WeatherLayerView | null) => void;
  selectedAt: number | null;
  onSelect: (id: WeatherLayerId, at: number | null) => void;
};

export function WeatherLayer({ id, onView, selectedAt, onSelect, suspended }: Props): JSX.Element {
  const [source, setSource] = useState<ObservationSource | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, retry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadSource[id]()
      .then((value) => {
        if (!cancelled) setSource(value);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onView(id, {
          frame: undefined,
          feed: { state: "failed", lastCheck: undefined, message: "Layer controls unavailable" },
        });
      });
    return () => {
      cancelled = true;
      onView(id, null);
    };
  }, [id, onView, revision]);
  return source ? (
    <WeatherPlayer
      suspended={suspended}
      id={id}
      onView={onView}
      source={source}
      selectedAt={selectedAt}
      onSelect={onSelect}
    />
  ) : (
    <div role="status">
      <p>
        {failed
          ? `Couldn’t open ${weatherLayers[id].label.toLowerCase()}.`
          : `Loading ${weatherLayers[id].label.toLowerCase()}…`}
      </p>
      {failed && (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            retry((n) => n + 1);
          }}
        >
          Retry layer
        </button>
      )}
    </div>
  );
}

function WeatherPlayer({
  id,
  onView,
  source,
  suspended,
  selectedAt,
  onSelect,
}: Props & { source: ObservationSource }): JSX.Element {
  const { data, state, lastCheck, retry } = useObservationData(source, id === "wind" ? "surface" : "");
  const select = useCallback((at: number | null) => onSelect(id, at), [id, onSelect]);
  const [playing, play] = useState(false);
  const frame = weatherFrame(data, id, selectedAt, Date.now());
  const frames = data?.frames;
  const index = frame ? (frames?.indexOf(frame) ?? 0) : 0;
  const latestAt = frames?.at(-1)?.at;
  const feed = useMemo(() => weatherFeed(id, state, lastCheck, latestAt), [id, state, lastCheck, latestAt]);
  useLayoutEffect(
    () => onView(id, { frame, feed, lastAvailable: !!frame && state !== "ready" }),
    [id, frame, feed, state, onView],
  );
  useEffect(() => {
    if (suspended || !playing || !frames?.length) return;
    let timer = 0;
    function step() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = frames?.[index + 1];
        if (next) select(next.at);
        else play(false);
      }, 900);
    }
    step();
    document.addEventListener("visibilitychange", step);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", step);
    };
  }, [playing, frames, index, select, suspended]);
  const meta = weatherLayers[id];
  const time = frame ? layerTime(frame.at) : "";
  const status =
    state === "loading"
      ? `Checking ${meta.source}…`
      : state === "failed"
        ? `Couldn’t reach ${meta.source}.`
        : state === "empty"
          ? id === "wind"
            ? "No forecast steps available."
            : "No recent lightning scans available."
          : null;
  return (
    <section className="weather-layer" aria-label={`${meta.label} playback`}>
      <p>{meta.coverage}</p>
      {status && (
        <div role="status">
          <p>{status}</p>
          {state === "failed" && (
            <button type="button" onClick={retry}>
              Retry {meta.label.toLowerCase()}
            </button>
          )}
        </div>
      )}
      {frame && frames && (
        <>
          <p className="weather-layer-time">
            {id === "wind" ? "Forecast valid" : "Scan time"} ·{" "}
            <time dateTime={new Date(frame.at).toISOString()}>{time}</time>
          </p>
          {frames.length > 1 && (
            <>
              <input
                className="scrub-slider"
                type="range"
                aria-label={`${meta.label} time`}
                aria-valuetext={time}
                min={0}
                max={frames.length - 1}
                value={index}
                onChange={(event) => {
                  play(false);
                  select(frames[event.currentTarget.valueAsNumber]!.at);
                }}
              />
              <div className="weather-layer-actions">
                <PlaybackButton
                  playing={playing}
                  ended={index === frames.length - 1}
                  onClick={() => {
                    if (!playing && index === frames.length - 1) select(frames[0]!.at);
                    play(!playing);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    play(false);
                    select(null);
                  }}
                >
                  {id === "wind" ? "Current forecast" : "Latest scan"}
                </button>
              </div>
            </>
          )}
          {frame.measurements?.map(({ label, value }) => (
            <p key={label}>
              {label}: {value}
            </p>
          ))}
        </>
      )}
      {state !== "ready" && frame && <p>Showing the last available data.</p>}
      {selectedAt !== null && frame && frame.at !== selectedAt && (
        <p role="status">The selected time is no longer available. Showing the nearest available step.</p>
      )}
      {feed.message?.includes("delayed") && <p role="status">The latest available data is delayed.</p>}
      <details>
        <summary>Coverage &amp; source</summary>
        <p>
          {data?.note ??
            (id === "wind"
              ? "Modeled surface wind on a sampled global grid, not measured gusts."
              : "Selected 20-second scans from GOES-East, not a continuous or worldwide record. No dots outside its coverage does not mean no lightning.")}
        </p>
        <a href={observations[id].url} target="_blank" rel="noreferrer" aria-describedby="external-link-hint">
          {meta.source}
        </a>
      </details>
    </section>
  );
}
