import { useEffect, useLayoutEffect, useState } from "react";
import { nearest } from "../../sources/observations/common";
import { observations, type ObservationId } from "./catalogue";
import type { ObservationFrame, ObservationSource, ObservationView } from "./types";
import { ObservationChart } from "./ObservationChart";
import { DeepTimePin } from "./DeepTimePin";
import { useObservationData, useObservationImage } from "./useObservationData";

import { useStorySession } from "./StorySession";

const lockRegionalCamera = () => {};
const EMPTY: readonly ObservationFrame[] = [];
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });

export function ObservationPlayer({
  id,
  source,
  horizon,
  photo,
  map,
  update,
  picker,
}: {
  id: ObservationId;
  source: ObservationSource;
  horizon: boolean;
  photo: boolean;
  map: boolean;
  update: (view: ObservationView | null) => void;
  picker?: { value: string; select: (value: string) => void };
}): JSX.Element {
  const { initial, remember } = useStorySession();
  const [localOption, setOption] = useState(
    initial?.choice &&
      (source.options?.some((p) => p.id === initial.choice) ||
        /^pin:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(initial.choice))
      ? initial.choice
      : (source.options?.[0]?.id ?? ""),
  );
  const option = picker?.value ?? localOption;
  const [selectedAt, setSelectedAt] = useState<number | null>(initial?.at ?? null);
  const [playing, setPlaying] = useState(false);
  const { data, state, reason, retry } = useObservationData(source, option);
  const frames = data?.frames ?? EMPTY;
  const frame =
    selectedAt === null ? frames[data?.initial ?? 0] : nearest(frames, selectedAt, ({ at }) => at);
  const index = frame ? frames.indexOf(frame) : 0;
  const { element, status } = useObservationImage(
    frame?.photograph?.url ?? frame?.raster?.url,
    frame?.photograph ? option : undefined,
  );
  const time = frame ? (frame.timeLabel ?? `${clock.format(frame.at)} UTC`) : "";
  const metadata = observations[id];
  const latest = frames.at(-1);
  const holding = state !== "ready" && latest !== undefined;
  const canHold = id === "deep" || id === "swell";

  useLayoutEffect(() => {
    if (canHold && (!data || !frame) && state === "loading") return;
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
            ...(data.lens ? { lens: data.lens, arrive: lockRegionalCamera } : {}),
          }
        : null,
    );
    if (frame)
      remember?.({
        choice: option,
        chapter: horizon ? "horizon" : photo ? "photo" : "",
        ...(id === "orbit" ? { city: option } : {}),
      });
  }, [data, frame, element, horizon, map, update, canHold, state, remember, option, id, photo]);

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
      {initial?.at !== undefined && frame && frame.at !== initial.at && selectedAt === initial.at && (
        <p className="observation-note" role="status">
          The linked time is outside the available observations. Showing the nearest available moment.
        </p>
      )}
      {source.options && (
        <label className="observation-picker">
          <span>{metadata.picker}</span>
          <select
            value={option}
            onChange={(event) => {
              if (!canHold) {
                update(null);
                setSelectedAt(null);
              }
              setPlaying(false);
              (picker?.select ?? setOption)(event.currentTarget.value);
            }}
          >
            {option.startsWith("pin:") && <option value={option}>Custom coordinates</option>}
            {source.options.map(({ id: key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {id === "deep" && (
        <DeepTimePin
          select={(value) => {
            setPlaying(false);
            setOption(value);
          }}
        />
      )}
      {frame && data && (
        <>
          <div className="observation-transport">
            <span>
              {id === "lightning" && frame === latest ? "Latest available scan" : metadata.time}
              {" · "}
              {frame.timeLabel ? time : <time dateTime={new Date(frame.at).toISOString()}>{time}</time>}
              {id === "rain" && " · Data arrives several hours after observation"}
            </span>
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
                aria-label={metadata.time}
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
          <p>{reason ?? `Couldn’t load ${metadata.title} data from ${metadata.source}.`}</p>
          <div className="observatory-actions observation-chapters">
            <button type="button" onClick={retry}>
              Retry source
            </button>
          </div>
        </div>
      )}
      {state === "empty" && (
        <p className="observation-note" role="status">
          {metadata.empty}
        </p>
      )}
      {holding && (
        <p className="observation-note" role="status">
          Showing the last available readings ·{" "}
          {latest.timeLabel ?? (
            <time dateTime={new Date(latest.at).toISOString()}>{clock.format(latest.at)} UTC</time>
          )}
        </p>
      )}
      {status === "failed" && (
        <p className="observation-note" role="status">
          No image could be loaded for this timestamp.
          {frame?.photograph && element ? " Showing the last loaded photograph." : ""}
        </p>
      )}
      {status === "loading" && (
        <p className="observation-note" role="status">
          {frame?.photograph && element
            ? "Loading this image… Showing the last loaded photograph."
            : "Loading this image…"}
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
