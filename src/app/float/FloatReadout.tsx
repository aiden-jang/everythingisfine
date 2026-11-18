import { geographicCoordinates } from "../../globe/orbitReadout";
import { useSyncExternalStore } from "react";
import type { FloatDiveView } from "./floatPlayback";
import { StoryProjection } from "../observations/StoryProjection";

type Projection = { map: boolean; setMap: (map: boolean) => void };
function Reading({ view, projection }: { view: FloatDiveView; projection: Projection }) {
  const { index, stage } = useSyncExternalStore(view.subscribe, view.read);
  const sample = view.profile.samples[index]!;
  return (
    <>
      {stage === "locate" && (
        <>
          <StoryProjection map={projection.map} onMap={projection.setMap} label="Float projection" />
          <span
            className="float-place"
            data-observation-anchor
            data-lon={view.profile.lon}
            data-lat={view.profile.lat}
          >
            Float {view.profile.wmo}
            <small>{geographicCoordinates(view.profile)}</small>
          </span>
        </>
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
  projection: Projection;
}): JSX.Element {
  const profile = view?.profile;
  return (
    <div className="observatory-stage" data-stage="float" role="group" aria-label="Argo float view">
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>{profile ? `Argo · WMO ${profile.wmo}` : "Argo · North Atlantic"}</span>
      </div>
      {view && <Reading view={view} projection={projection} />}
      <div id="float-profile-stage" />
      {profile && (
        <div className="stage-readout">{geographicCoordinates(profile)} · Illustrated ocean section</div>
      )}
    </div>
  );
}
