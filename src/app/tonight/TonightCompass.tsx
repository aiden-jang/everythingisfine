import { StoryProjection } from "../observations/StoryProjection";
import { bearingLabel, type TonightView } from "../../geo/tonight";

const bearings = [
  { short: "N", name: "north", azimuth: 0 },
  { short: "E", name: "east", azimuth: 90 },
  { short: "S", name: "south", azimuth: 180 },
  { short: "W", name: "west", azimuth: 270 },
];

export function TonightCompass({
  view,
  onView,
  projection,
  orbit,
  onOrbit,
}: {
  view: TonightView | null;
  onView: (view: TonightView) => void;
  projection: { map: boolean; setMap: (map: boolean) => void };
  orbit: boolean;
  onOrbit: (orbit: boolean) => void;
}): JSX.Element {
  const fromEarth = projection.map || orbit;
  const target = view?.bodies.find(({ name }) => name === view.targetName);
  return (
    <div
      className="observatory-stage"
      data-stage="tonight"
      data-meteor-view={view?.radiantTrail ? true : undefined}
      role="group"
      aria-label="Local horizon"
    >
      <div className="stage-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>
          {view?.city.name ?? "After Dark"} ·{" "}
          {projection.map ? "Earth reference" : orbit ? "Orbit" : "Local horizon"}
        </span>
      </div>
      {view?.radiantTrail && (
        <svg className="meteor-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path data-radiant-arc="" pathLength="1" />
        </svg>
      )}
      <div className="tonight-labels" data-sky-labels="" aria-hidden="true">
        {view?.bodies.map(({ name }) => (
          <span key={name} data-body={name} data-target={target?.name === name || undefined}>
            {name}
          </span>
        ))}
      </div>
      {view && fromEarth && (
        <span
          className="sky-reference-marker"
          data-projection-anchor=""
          data-observation-anchor=""
          data-lon={view.city.lon}
          data-lat={view.city.lat}
        >
          {view.city.name}
        </span>
      )}
      {view && !view.radiantTrail && (
        <StoryProjection
          map={projection.map}
          globeActive={orbit && !projection.map}
          globeLabel="Orbit"
          onMap={(map) => {
            onOrbit(!map);
            projection.setMap(map);
          }}
          label="Sky reference projection"
        >
          <button
            type="button"
            aria-pressed={!fromEarth}
            onClick={() => {
              onOrbit(false);
              projection.setMap(false);
            }}
          >
            Local sky
          </button>
        </StoryProjection>
      )}
      {view && !fromEarth && (
        <div className="stage-readout tonight-compass">
          <span>
            Facing {bearingLabel(view.look.azimuth)} · {Math.round(view.look.azimuth) % 360}°
            {target && (
              <small className="tonight-target-bearing">
                {target.name} · {target.altitude > 0 ? bearingLabel(target.azimuth) : "Below horizon"}
              </small>
            )}
          </span>
          <div className="observatory-actions" role="group" aria-label="Look direction">
            {bearings.map(({ short, name, azimuth }) => (
              <button
                key={short}
                type="button"
                aria-label={`Look ${name}`}
                aria-pressed={view.look.azimuth === azimuth && view.look.altitude === 16}
                onClick={() => onView({ ...view, look: { azimuth, altitude: 16 } })}
              >
                {short}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
