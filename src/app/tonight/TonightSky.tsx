import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { aimAt, bearingLabel, localNight, openingSky, skyBodies, type TonightView } from "../../geo/tonight";
import { sunElevation } from "../../geo/sun";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { skyCities } from "./cities";

const MINUTE = 60_000;

export function TonightSky({
  view,
  onView,
  onClose,
}: {
  view: TonightView | null;
  onView: (next: TonightView) => void;
  onClose: () => void;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const [openedAt] = useState(() => Date.now());
  const city =
    view?.city ??
    skyCities.find(({ zone }) => zone === Intl.DateTimeFormat().resolvedOptions().timeZone) ??
    skyCities[0]!;
  const night = useMemo(() => localNight(city, openedAt), [city, openedAt]);
  const format = useMemo(
    () => ({
      clock: new Intl.DateTimeFormat("en", { timeZone: city.zone, hour: "numeric", minute: "2-digit" }),
      local: new Intl.DateTimeFormat("en", {
        timeZone: city.zone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    }),
    [city],
  );
  const current = view ?? openingSky(city, night.start, night.end);
  const at = current.at;
  const readings = current.bodies;
  const above = readings.filter((body) => body.altitude > 0).length;
  const sun = sunElevation(city.lon, city.lat, at);
  const sky = sun >= -0.833 ? "Daylight" : sun > -18 ? "Twilight" : "Dark sky";

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useLayoutEffect(() => {
    if (!view) onView(current);
  }, [view, current, onView]);
  useObservatoryEscape(onClose);

  return (
    <>
      <div className="tonight-heading">
        <h2>Tonight’s Sky</h2>
        <div className="observatory-actions tonight-back">
          <button type="button" ref={back} onClick={onClose} aria-label="Back to stars">
            Back
          </button>
        </div>
      </div>
      <label className="tonight-city">
        <span>City</span>
        <select
          value={city.name}
          onChange={(event) => {
            const next = skyCities.find(({ name }) => name === event.currentTarget.value);
            if (!next) return;
            const nextNight = localNight(next, openedAt);
            onView(openingSky(next, nextNight.start, nextNight.end));
          }}
        >
          {skyCities.map(({ name }) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <div className="tonight-time">
        <div className="tonight-clock">
          <label htmlFor={rangeId}>Local sky time</label>
          <time dateTime={new Date(at).toISOString()}>{format.local.format(at)}</time>
        </div>
        <input
          id={rangeId}
          type="range"
          className="scrub-slider tonight-scrub"
          min={0}
          max={(night.end - night.start) / MINUTE}
          value={(at - night.start) / MINUTE}
          aria-valuetext={format.local.format(at)}
          onChange={(event) => {
            const at = night.start + event.currentTarget.valueAsNumber * MINUTE;
            onView({ ...current, at, bodies: skyBodies(city, at) });
          }}
        />
        <div className="tonight-clock tonight-edges">
          <span>
            {night.sunset ? "Sunset" : "Evening"} · {format.clock.format(night.start)}
          </span>
          <span>
            {night.sunrise ? "Sunrise" : "Morning"} · {format.clock.format(night.end)}
          </span>
        </div>
      </div>
      <details className="tonight-objects" open>
        <summary>
          <span>Moon &amp; planets</span>
          <span>
            {sky} · {above} above horizon
          </span>
        </summary>
        <ul>
          {readings.map((body) => (
            <li key={body.name}>
              <button
                type="button"
                disabled={body.altitude <= 0}
                aria-label={body.altitude > 0 ? `Point at ${body.name}` : `${body.name}, below horizon`}
                onClick={() => onView({ ...current, look: aimAt(body), targetName: body.name })}
              >
                <span>
                  {body.name}
                  {body.lit !== null && <small>{body.lit}% lit</small>}
                </span>
                <span>
                  {body.altitude > 0
                    ? `${Math.round(body.altitude)}° ↑ · ${bearingLabel(body.azimuth)}`
                    : "Below horizon"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p>Calculated positions at a level horizon. Clouds and light pollution affect what you’ll see.</p>
      </details>
    </>
  );
}
