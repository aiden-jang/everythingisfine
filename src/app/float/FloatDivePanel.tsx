import { PlaybackButton } from "../PlaybackButton";
import type { VisitPosition } from "../visitor/library";
import { MeasurementSound } from "../MeasurementSound";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { ARGO_DOI, ARGO_PROVIDER, type ArgoSample, type ArgoStation } from "../../sources/argo";
import { useObservatoryEscape } from "../useObservatoryEscape";
import type { FloatDiveView } from "./floatPlayback";
import { useArgoProfiles } from "./useArgoProfiles";

const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const meters = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function name({ wmo, at }: ArgoStation) {
  return `${date.format(at)} · WMO ${wmo}`;
}

function trace(samples: readonly ArgoSample[], field: "temperature" | "salinity") {
  const values = samples.map((sample) => sample[field]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = samples[0]!.depth;
  const span = first - samples.at(-1)!.depth;
  const points = samples.map((sample) => ({
    x: 4 + ((first - sample.depth) / span) * 112,
    y: max > min ? 32 - ((sample[field] - min) / (max - min)) * 28 : 18,
  }));
  return { points, line: points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") };
}

function Measurements({ view, sound }: { view: FloatDiveView; sound: boolean }): JSX.Element {
  const { index, playing } = useSyncExternalStore(view.subscribe, view.read);
  const { samples } = view.profile;
  const sample = samples[index]!;
  const depth = `${meters.format(sample.depth)} m`;
  const traces = useMemo(
    () =>
      [
        {
          ...trace(samples, "temperature"),
          label: "Temperature",
          field: "temperature",
          suffix: " °C",
          digits: 2,
        },
        {
          ...trace(samples, "salinity"),
          label: "Practical salinity",
          field: "salinity",
          suffix: "",
          digits: 3,
        },
      ] as const,
    [samples],
  );

  return (
    <>
      <div className="float-transport">
        <div className="float-depth">
          <span>Estimated depth</span>
          <strong data-float-depth>
            {meters.format(sample.depth)} <span>m</span>
          </strong>
          <small>{sample.pressure.toFixed(1)} dbar</small>
        </div>
        <input
          type="range"
          className="scrub-slider float-scrub"
          min={0}
          max={samples.length - 1}
          value={index}
          onChange={(event) => view.seek(event.currentTarget.valueAsNumber)}
          aria-label="Ascent depth"
          aria-valuetext={depth}
        />
        <div className="float-edges">
          <span>{meters.format(samples[0]!.depth)} m</span>
          <div className="observatory-actions float-actions">
            <PlaybackButton playing={playing} ended={index === samples.length - 1} onClick={view.toggle} />
          </div>
          <span>{meters.format(samples.at(-1)!.depth)} m</span>
        </div>
      </div>
      <div className="float-measurements">
        {traces.map(({ label, field, line, points, suffix, digits }) => (
          <div className="float-trace" data-reading={field} key={field}>
            <div className="float-value">
              <span>{label}</span>
              <strong>
                {sample[field].toFixed(digits)}
                {suffix}
              </strong>
            </div>
            <svg viewBox="0 0 120 36" aria-hidden="true">
              <path d="M4 32H116 M4 4V32" className="float-axis" />
              <polyline points={line} />
              <circle cx={points[index]!.x} cy={points[index]!.y} r={2.8} />
            </svg>
          </div>
        ))}
      </div>
      {sound && (
        <MeasurementSound
          key={view.profile.id}
          value={sample.temperature}
          min={-2}
          max={35}
          label="temperature"
          explanation="Higher pitch means warmer measured water (−2 to 35 °C)."
        />
      )}
    </>
  );
}

export function FloatDivePanel({
  view,
  onView,
  onClose,
  resume,
  returnLabel = "Back to Live Earth",
}: {
  view: FloatDiveView | null;
  onView: (view: FloatDiveView) => void;
  onClose: () => void;
  resume?: VisitPosition["float"];
  returnLabel?: string | undefined;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useObservatoryEscape(onClose);
  const { saved, catalogue, pending, problem, select, retry } = useArgoProfiles(view, onView, resume);
  const value = pending ?? (view ? `${view.source}/${view.profile.id}` : "");

  return (
    <>
      <div className="float-heading">
        <h2>Float Dive</h2>
        <div className="observatory-actions float-actions">
          <button type="button" ref={back} onClick={onClose} aria-label={returnLabel}>
            {returnLabel}
          </button>
        </div>
      </div>
      <p className="float-summary">Follow an Argo float from the deep Atlantic toward the surface.</p>
      <label className="float-picker">
        <span>Float profile</span>
        <select value={value} onChange={(event) => select(event.currentTarget.value)}>
          {!view && (
            <option value="" disabled>
              Opening recorded profile…
            </option>
          )}
          <optgroup label="Recorded profiles">
            {saved.map((station) => (
              <option key={station.id} value={`recorded/${station.id}`}>
                {name(station)}
              </option>
            ))}
          </optgroup>
          {catalogue.stations.length > 0 && (
            <optgroup label="Recent North Atlantic profiles">
              {catalogue.stations.map((station) => (
                <option key={station.id} value={`recent/${station.id}`}>
                  {name(station)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {view && <Measurements view={view} sound={!pending && !problem} />}
      <div className="float-meta">
        {view && (
          <p>
            {view.source === "recorded" ? "Recorded profile" : "Recent profile"} · Cycle {view.profile.cycle}{" "}
            ·{" "}
            <time dateTime={new Date(view.profile.at).toISOString()}>{date.format(view.profile.at)} UTC</time>
          </p>
        )}
        {pending ? (
          <p role="status">Checking this profile’s readings…</p>
        ) : problem ? (
          <p role="status">
            {problem === "resume"
              ? "The saved profile could not be restored."
              : "Couldn’t load usable readings for the selected profile."}
            {view && ` Still showing ${name(view.profile)}, cycle ${view.profile.cycle}.`}
          </p>
        ) : catalogue.state === "loading" ? (
          <p role="status">Checking for recent North Atlantic profiles…</p>
        ) : null}
        {catalogue.state === "error" && (
          <>
            <p role="status">Couldn’t load recent Argo profiles. Recorded profiles are available.</p>
            <div className="observatory-actions float-actions">
              <button type="button" onClick={retry}>
                Retry recent profiles
              </button>
            </div>
          </>
        )}
        {catalogue.state === "ready" && catalogue.stations.length === 0 && <p>No recent profiles found.</p>}
      </div>
      <details className="replay-sources">
        <summary>Sources &amp; coverage</summary>
        <p>
          Each step shows a measured sample. Depth is estimated from pressure and the ascent is compressed for
          playback.
        </p>
      </details>
      <p className="float-source">
        <a href={ARGO_DOI} target="_blank" rel="noreferrer" aria-describedby="external-link-hint">
          Argo data
        </a>
        {" · "}
        <a href={ARGO_PROVIDER} target="_blank" rel="noreferrer" aria-describedby="external-link-hint">
          Marine Institute
        </a>
      </p>
    </>
  );
}
