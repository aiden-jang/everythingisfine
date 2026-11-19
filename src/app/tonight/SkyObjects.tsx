import { aimAt, bearingLabel, type TonightView } from "../../geo/tonight";
import { skyTargets } from "./skyTargets";

export function SkyObjects({
  current,
  sky,
  onView,
  moonset,
}: {
  current: TonightView;
  sky: string;
  moonset?: string | undefined;
  onView: (view: TonightView) => void;
}) {
  const { visible, below } = skyTargets(current.bodies);
  return (
    <section className="tonight-objects" aria-label="Moon and planets">
      <h3>Above the horizon</h3>
      <p className="tonight-visibility">
        {sky} · {visible.length} {visible.length === 1 ? "object" : "objects"} above the horizon
      </p>
      {visible.length > 0 ? (
        <ul aria-label="Above the horizon">
          {visible.map((body) => (
            <li key={body.name}>
              <button
                type="button"
                aria-label={`Find ${body.name}`}
                aria-pressed={current.targetName === body.name}
                onClick={() => onView({ ...current, look: aimAt(body), targetName: body.name })}
              >
                <span>
                  <strong>{body.name}</strong>
                  <small>
                    {body.lit !== null && `${body.lit}% lit · `}
                    {Math.round(body.altitude)}° above horizon · {bearingLabel(body.azimuth)}
                    {body.name === "Moon" && moonset && ` · ${moonset}`}
                  </small>
                </span>
                <span>Find</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No Moon or planets are above the horizon at this time. Move through the night to look again.</p>
      )}
      {below.length > 0 && (
        <details className="tonight-below">
          <summary>
            {below.length} {below.length === 1 ? "object" : "objects"} below the horizon
          </summary>
          <ul aria-label="Below the horizon">
            {below.map((body) => (
              <li key={body.name}>
                <span>{body.name}</span>
                <small>Below horizon{body.name === "Moon" && moonset && ` · ${moonset}`}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p>Calculated positions at a level horizon. Clouds and light pollution affect what you’ll see.</p>
    </section>
  );
}
