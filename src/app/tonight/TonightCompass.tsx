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
}: {
  view: TonightView | null;
  onView: (view: TonightView) => void;
}): JSX.Element {
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
        <span>{view?.city.name ?? "After Dark"} · Local horizon</span>
      </div>
      {view?.radiantTrail && (
        <svg className="meteor-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path data-radiant-arc="" pathLength="1" />
        </svg>
      )}
      <div className="tonight-labels" data-sky-labels="" aria-hidden="true">
        {view?.bodies.map(({ name }) => (
          <span key={name} data-body={name}>
            {name}
          </span>
        ))}
      </div>
      {view && (
        <div className="stage-readout tonight-compass">
          <span>
            Facing {bearingLabel(view.look.azimuth)} · {Math.round(view.look.azimuth) % 360}°
          </span>
          <div className="observatory-actions" role="group" aria-label="Look direction">
            {bearings.map(({ short, name, azimuth }) => (
              <button
                key={short}
                type="button"
                aria-label={`Look ${name}`}
                aria-pressed={view.look.azimuth === azimuth && view.look.altitude === 16}
                onClick={() => onView({ ...view, look: { azimuth, altitude: 16 }, targetName: undefined })}
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
