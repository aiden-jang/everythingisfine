import { geographicCoordinates } from "../../globe/orbitReadout";
import type { FloatDiveView } from "./floatPlayback";

export function FloatReadout({ view }: { view: FloatDiveView | null }): JSX.Element {
  const profile = view?.profile;
  return (
    <div className="observatory-stage" data-stage="float" role="group" aria-label="Argo float on the globe">
      <div className="stage-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>{profile ? `Argo · WMO ${profile.wmo}` : "Argo · North Atlantic"}</span>
      </div>
      {profile && <div className="stage-readout">{geographicCoordinates(profile)} · Schematic ascent</div>}
    </div>
  );
}
