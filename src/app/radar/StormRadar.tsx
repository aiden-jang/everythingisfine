import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { RADAR_SERVICE } from "../../sources/radar";
import type { RadarView } from "./radarCamera";
import { useObservatoryEscape } from "../useObservatoryEscape";
import "./radar.css";

const RadarStage = lazy(() => import("./RadarStage").then(({ RadarStage }) => ({ default: RadarStage })));

export function RadarReadout({ map }: { map: boolean }): JSX.Element {
  return (
    <div
      className="observatory-stage"
      data-stage="radar"
      role="group"
      aria-label={map ? "Radar on the map" : "Radar on the globe"}
    >
      <div className="stage-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>NOAA MRMS · Base reflectivity</span>
      </div>
      <div className="stage-readout">Contiguous United States</div>
    </div>
  );
}

export function StormRadar({
  fromExplore,
  onClose,
  onView,
  projection,
  entry,
}: {
  fromExplore: boolean;
  entry: { region?: string; story?: boolean };
  onClose: () => void;
  onView: (view: RadarView) => void;
  projection: { map: boolean; setMap: (map: boolean) => void };
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useObservatoryEscape(onClose);

  const backLabel = entry.story
    ? "Back to Atmospheric River"
    : fromExplore
      ? "Back to Explore"
      : "Back to Live Earth";
  return (
    <>
      <div className="radar-heading">
        <h2>Storm Radar</h2>
        <div className="observatory-actions radar-actions">
          <button type="button" ref={back} onClick={onClose} aria-label={backLabel}>
            <span className="observation-back-full">{backLabel}</span>
            <span className="observation-back-compact">Back</span>
          </button>
        </div>
      </div>
      <div
        className="observatory-actions radar-actions radar-projection"
        role="group"
        aria-label="Radar projection"
      >
        <button type="button" aria-pressed={!projection.map} onClick={() => projection.setMap(false)}>
          Globe
        </button>
        <button type="button" aria-pressed={projection.map} onClick={() => projection.setMap(true)}>
          Map
        </button>
      </div>
      <Suspense fallback={<p role="status">Opening Storm Radar…</p>}>
        <RadarStage onView={onView} initialRegion={entry.region} />
      </Suspense>
      <details className="radar-coverage">
        <summary>Data &amp; coverage</summary>
        <p>
          Recent radar reflectivity across the contiguous United States. Returns show what the radar detected,
          not a forecast of where rain will move.
        </p>
        <div className="radar-sources" aria-label="Storm Radar sources">
          <a href={RADAR_SERVICE} target="_blank" rel="noreferrer" aria-describedby="external-link-hint">
            NOAA MRMS
          </a>
          <a
            href="https://www.weather.gov/jetstream/reflectivity"
            target="_blank"
            rel="noreferrer"
            aria-describedby="external-link-hint"
          >
            What reflectivity means
          </a>
        </div>
      </details>
    </>
  );
}
