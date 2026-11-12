import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import { RADAR_SERVICE } from "../../sources/radar";
import { isGlobalRadar, type RadarView } from "./radarCamera";
import { useObservatoryEscape } from "../useObservatoryEscape";
import "./radar.css";

const RadarStage = lazy(() => import("./RadarStage").then(({ RadarStage }) => ({ default: RadarStage })));

export function RadarReadout({ map, region }: { map: boolean; region?: string | undefined }): JSX.Element {
  const global = isGlobalRadar(region);
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
        {global ? (
          <a
            className="radar-attribution"
            href="https://www.rainviewer.com/"
            target="_blank"
            rel="noreferrer"
            aria-describedby="external-link-hint"
          >
            Weather data by RainViewer
          </a>
        ) : (
          <span>NOAA MRMS · Base reflectivity</span>
        )}
      </div>
      <div className="stage-readout">
        {global ? "International radar network" : "Contiguous United States"}
      </div>
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
  entry: { region?: string; story?: boolean; at?: number };
  onClose: () => void;
  onView: (view: RadarView) => void;
  projection: { map: boolean; setMap: (map: boolean) => void };
}): JSX.Element {
  const [global, setGlobal] = useState(() => isGlobalRadar(entry.region));
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
      <div className="radar-place">
        <label htmlFor="radar-source">Coverage</label>
        <select
          id="radar-source"
          value={global ? "global" : "us"}
          onChange={(event) => setGlobal(event.currentTarget.value === "global")}
        >
          <option value="global">Worldwide network</option>
          <option value="us">United States · NOAA detail</option>
        </select>
      </div>
      <Suspense
        fallback={
          <p role="status" aria-label="Radar status">
            Opening Storm Radar…
          </p>
        }
      >
        <RadarStage
          key={global ? "global" : "us"}
          global={global}
          onView={onView}
          initialRegion={global === isGlobalRadar(entry.region) ? entry.region : undefined}
          initialAt={global === isGlobalRadar(entry.region) ? entry.at : undefined}
        />
      </Suspense>
      {global && (
        <div className="radar-coverage">
          <p>
            Striped areas have no listed radar coverage. Coverage varies by country; a blank area does not
            always mean dry weather.
          </p>
        </div>
      )}
      <details className="radar-coverage">
        <summary>Data &amp; coverage</summary>
        <p>
          {global
            ? "Observed composites from participating radar networks, covering the past two hours in ten-minute steps. Frame time is the composite time; individual radars can be older. The coverage mask is approximate and does not report station outages. Polar areas beyond 85° are outside the map. This is a regional overview, not street-level radar."
            : "Recent radar reflectivity across the contiguous United States. GOES-East lightning covers the Americas, not the whole world."}{" "}
          Returns show what radar detected, not a forecast of where rain will move.
        </p>
        <div className="radar-sources" aria-label="Storm Radar sources">
          <a
            href={global ? "https://www.rainviewer.com/api/weather-maps-api.html" : RADAR_SERVICE}
            target="_blank"
            rel="noreferrer"
            aria-describedby="external-link-hint"
          >
            {global ? "RainViewer radar composites" : "NOAA MRMS"}
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
