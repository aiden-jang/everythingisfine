import { SharedStory } from "../observations/SharedStory";
import type { VisitPosition } from "../visitor/library";
import { useLayoutEffect, useRef } from "react";
import { ARGO_DOI, ARGO_PROVIDER, type ArgoStation } from "../../sources/argo";
import { useObservatoryEscape } from "../useObservatoryEscape";
import type { FloatDiveView } from "./floatPlayback";
import { useArgoProfiles } from "./useArgoProfiles";
import { ShareMoment } from "../observations/StorySession";
import { FloatTitle } from "./FloatChapter";
import { FloatMeasurements } from "./FloatMeasurements";
import { floatMoment } from "./floatMoment";

const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function name({ wmo, at }: ArgoStation) {
  return `${date.format(at)} · WMO ${wmo}`;
}

export function FloatDivePanel({
  view,
  onView,
  onClose,
  resume,
  returnLabel = "Back to Earth",
  projection,
}: {
  projection: { map: boolean; setMap: (map: boolean) => void };
  view: FloatDiveView | null;
  onView: (view: FloatDiveView, deliberate?: boolean) => void;
  onClose: () => void;
  resume?: VisitPosition["float"];
  returnLabel?: string | undefined;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useObservatoryEscape(() => {
    if (view?.read().inspecting) view.inspect(false);
    else onClose();
  });
  const { saved, catalogue, pending, problem, select, retry } = useArgoProfiles(view, onView, resume);
  const value = pending ?? (view ? `${view.source}/${view.profile.id}` : "");

  return (
    <>
      <div className="float-heading">
        {view ? <FloatTitle view={view} /> : <h2>Float Dive</h2>}
        <div className="observatory-actions float-actions">
          <button type="button" ref={back} onClick={onClose} aria-label={returnLabel}>
            {returnLabel}
          </button>
        </div>
      </div>
      <p className="float-summary">The ocean has layers. This float measured them.</p>
      {resume &&
        view &&
        !problem &&
        resume.profile === `${view.source}/${view.profile.id}` &&
        resume.index < view.profile.samples.length && (
          <SharedStory moment={floatMoment(view, projection.map)} />
        )}
      {resume &&
        view &&
        resume.profile === `${view.source}/${view.profile.id}` &&
        resume.index >= view.profile.samples.length && (
          <p role="status">The saved sample is outside this profile. Showing its nearest usable sample.</p>
        )}
      {view && (
        <p className="float-provenance">
          {view.source === "recorded" ? "Recorded profile" : "Recent profile"} · Cycle {view.profile.cycle} ·{" "}
          <time dateTime={new Date(view.profile.at).toISOString()}>{date.format(view.profile.at)} UTC</time>
        </p>
      )}
      {view && <FloatMeasurements view={view} sound={!pending && !problem} onClose={onClose} />}
      {view && <ShareMoment current={() => floatMoment(view, projection.map)} />}
      <div className="float-meta">
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
        {(catalogue.state === "error" || problem === "resume") && (
          <>
            {catalogue.state === "error" && (
              <p role="status">Couldn’t load recent Argo profiles. Recorded profiles are available.</p>
            )}
            <div className="observatory-actions float-actions">
              <button type="button" onClick={retry}>
                Retry recent profiles
              </button>
            </div>
          </>
        )}
        {catalogue.state === "ready" && catalogue.stations.length === 0 && <p>No recent profiles found.</p>}
      </div>
      <details className="float-evidence">
        <summary>Profile &amp; evidence</summary>
        <label className="float-picker">
          <span>Float profile</span>
          <select value={value} onChange={(event) => select(event.currentTarget.value)}>
            {!view && (
              <option value="" disabled>
                {resume ? "Restoring saved profile…" : "Opening recorded profile…"}
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
        <details className="replay-sources">
          <summary>Sources &amp; coverage</summary>
          <p>
            Each step shows a measured sample. Depth is estimated from pressure and the ascent is compressed
            for playback.
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
      </details>
    </>
  );
}
