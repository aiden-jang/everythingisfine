import { useEffect, useLayoutEffect, useState } from "react";
import { nearest } from "../../sources/observations/common";
import { observations, type ObservationId } from "./catalogue";
import type { ObservationFrame, ObservationSource, ObservationView } from "./types";
import { ObservationChart } from "./ObservationChart";
import { useObservationData, useObservationImage } from "./useObservationData";

const EMPTY: readonly ObservationFrame[] = [];
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });

export function ObservationPlayer({
  id,
  source,
  horizon,
  map,
  update,
}: {
  id: ObservationId;
  source: ObservationSource;
  horizon: boolean;
  map: boolean;
  update: (view: ObservationView | null) => void;
}): JSX.Element {
  const [option, setOption] = useState(source.options?.[0]?.id ?? "");
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const { data, state, retry } = useObservationData(source, option);
  const frames = data?.frames ?? EMPTY;
  const frame =
    selectedAt === null ? frames[data?.initial ?? 0] : nearest(frames, selectedAt, ({ at }) => at);
  const index = frame ? frames.indexOf(frame) : 0;
  const { element, status } = useObservationImage(frame?.raster?.url);
  const time = frame ? `${clock.format(frame.at)} UTC` : "";
  const metadata = observations[id];

  useLayoutEffect(() => {
    const sky =
      horizon && frame?.localSky
        ? {
            kind: "tonight" as const,
            ...frame.localSky,
            at: frame.at,
            look: { ...frame.localSky.look, altitude: Math.max(5, frame.localSky.look.altitude) },
            bodies: [],
          }
        : undefined;
    update(
      data && frame
        ? {
            kind: "observation",
            target: (map ? data.mapTarget : undefined) ?? frame.camera ?? data.target,
            frame,
            image: element,
            sky,
          }
        : null,
    );
  }, [data, frame, element, horizon, map, update]);

  useEffect(() => {
    if (!playing || status === "loading") return;
    let timer = 0;
    function step() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(
        () => {
          const next = frames[index + 1];
          if (next) setSelectedAt(next.at);
          else setPlaying(false);
        },
        Math.max(120, Math.min(800, 18_000 / frames.length)),
      );
    }
    step();
    document.addEventListener("visibilitychange", step);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", step);
    };
  }, [frames, index, playing, status]);

  return (
    <>
      {source.options && (
        <label className="observation-picker">
          <span>{id === "orbit" || id === "air" ? "City" : id === "wind" ? "Wind level" : "Location"}</span>
          <select
            value={option}
            onChange={(event) => {
              update(null);
              setSelectedAt(null);
              setPlaying(false);
              setOption(event.currentTarget.value);
            }}
          >
            {source.options.map(({ id: key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {frame && data && (
        <>
          <div className="observation-transport">
            <time dateTime={new Date(frame.at).toISOString()}>{time}</time>
            {frames.length > 1 && (
              <div className="observatory-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (!playing && index === frames.length - 1) setSelectedAt(frames[0]!.at);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? "Pause" : index === frames.length - 1 ? "Replay" : "Play"}
                </button>
              </div>
            )}
            {frames.length > 1 && (
              <input
                className="scrub-slider observation-scrub"
                aria-label="Observation time"
                aria-valuetext={time}
                type="range"
                min={0}
                max={frames.length - 1}
                value={index}
                onChange={(event) => {
                  setPlaying(false);
                  setSelectedAt(frames[event.currentTarget.valueAsNumber]!.at);
                }}
              />
            )}
          </div>
          {frame.measurements?.length ? (
            <dl className="observation-values">
              {frame.measurements.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {frame.details && (
            <details className="observation-details">
              <summary>{frame.details.title}</summary>
              <dl className="observation-values">
                {frame.details.rows.map(({ label, value }, key) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {data.series && <ObservationChart series={data.series} at={frame.at} units={data.units} />}
          {data.chapters?.length ? (
            <div className="observatory-actions observation-chapters">
              {data.chapters.map(({ index: jump, label }) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => {
                    setPlaying(false);
                    setSelectedAt(frames[jump]!.at);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
      {state === "loading" && (
        <p className="observation-note" role="status">
          Checking {metadata.source}…
        </p>
      )}
      {state === "failed" && (
        <div className="observation-note" role="status">
          <p>
            Couldn’t reach {metadata.source}.{data ? " The last successful readings are still shown." : ""}
          </p>
          <div className="observatory-actions observation-chapters">
            <button type="button" onClick={retry}>
              Retry source
            </button>
          </div>
        </div>
      )}
      {state === "empty" && (
        <p className="observation-note" role="status">
          The provider returned no readings for this selection.
          {data ? " The previous readings are still shown." : ""}
        </p>
      )}
      {status === "failed" && (
        <p className="observation-note" role="status">
          No image could be loaded for this timestamp.
        </p>
      )}
      {status === "loading" && (
        <p className="observation-note" role="status">
          Loading this image…
        </p>
      )}
      {data && <p className="observation-note">{data.note}</p>}
      <a
        className="observation-source"
        href={metadata.url}
        target="_blank"
        rel="noreferrer"
        aria-describedby="external-link-hint"
      >
        {metadata.source}
      </a>
    </>
  );
}
