import { geographicCoordinates } from "../../globe/orbitReadout";
import { useSyncExternalStore } from "react";
import type { FloatDiveView } from "./floatPlayback";

function Reading({ view }: { view: FloatDiveView }) {
  const { index, stage } = useSyncExternalStore(view.subscribe, view.read);
  const sample = view.profile.samples[index]!;
  return (
    <>
      {stage === "locate" && (
        <span
          className="float-place"
          data-observation-anchor
          data-lon={view.profile.lon}
          data-lat={view.profile.lat}
        >
          Float {view.profile.wmo}
          <small>{geographicCoordinates(view.profile)}</small>
        </span>
      )}
      <div className="float-reading-layer" aria-hidden="true">
        <svg className="float-tether">
          <path fill="none" />
        </svg>
        <div className="float-instrument-reading" data-float-instrument>
          <span>{Math.round(sample.depth).toLocaleString()} m</span>
          <small>{sample.temperature.toFixed(2)} °C</small>
        </div>
      </div>
    </>
  );
}

export function FloatReadout({
  view,
  projection,
}: {
  view: FloatDiveView | null;
  projection: { map: boolean; setMap: (map: boolean) => void };
}): JSX.Element {
  const profile = view?.profile;
  return (
    <div
      className="observatory-stage"
      data-stage="float"
      role="group"
      aria-label="Argo float on the globe and map"
    >
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>{profile ? `Argo · WMO ${profile.wmo}` : "Argo · North Atlantic"}</span>
      </div>
      <div className="float-stage-tools observatory-actions" role="group" aria-label="Float projection">
        <button type="button" aria-pressed={!projection.map} onClick={() => projection.setMap(false)}>
          Globe
        </button>
        <button type="button" aria-pressed={projection.map} onClick={() => projection.setMap(true)}>
          Map
        </button>
      </div>
      {view && <Reading view={view} />}
      <div id="float-profile-stage" />
      {profile && (
        <div className="stage-readout">{geographicCoordinates(profile)} · Illustrated ocean section</div>
      )}
    </div>
  );
}
