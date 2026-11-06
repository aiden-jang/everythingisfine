import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  aimAt,
  bearingLabel,
  localNight,
  openingSky,
  skyBodies,
  type SkyLook,
  type TonightView,
} from "../../geo/tonight";
import { sunElevation } from "../../geo/sun";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { SkyCityPicker, type SkyCityPreference } from "./SkyCityPicker";
import { MeteorNights } from "./MeteorNights";

const MINUTE = 60_000;

export function TonightSky({
  view,
  onView,
  onClose,
  preference,
  initialMode,
  initialLook,
}: {
  view: TonightView | null;
  onView: (next: TonightView) => void;
  onClose: () => void;
  preference: SkyCityPreference;
  initialMode: "sky" | "meteors";
  initialLook: SkyLook | undefined;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const [openedAt] = useState(() => Date.now());
  const [mode, setMode] = useState(initialMode);
  const [modeLook, setModeLook] = useState(initialLook);
  const { city } = preference;
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
  const opening = useMemo(() => openingSky(city, night.start, night.end), [city, night.start, night.end]);
  const current = view?.city.name === city.name ? view : { ...opening, look: initialLook ?? opening.look };
  const at = current.at;
  const readings = current.bodies;
  const above = readings.filter((body) => body.altitude > 0).length;
  const sun = sunElevation(city.lon, city.lat, at);
  const sky = sun >= -0.833 ? "Daylight" : sun > -18 ? "Twilight" : "Dark sky";

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useLayoutEffect(() => {
    if (mode === "sky" && view?.city.name !== city.name) {
      onView({ ...opening, look: initialLook ?? opening.look });
    }
  }, [view?.city.name, city.name, mode, opening, initialLook, onView]);
  useObservatoryEscape(onClose);

  return (
    <>
      <div className="tonight-heading">
        <h2 id="local-sky-title">{mode === "sky" ? "Tonight’s Sky" : "Meteor Nights"}</h2>
        <div className="observatory-actions tonight-back">
          <button type="button" ref={back} onClick={onClose} aria-label="Back to After Dark">
            Back to After Dark
          </button>
        </div>
      </div>
      <SkyCityPicker city={city.name} select={preference.select} />
      <div className="observatory-actions tonight-mode" role="group" aria-label="Local sky view">
        <button
          type="button"
          aria-pressed={mode === "sky"}
          onClick={() => {
            if (mode === "sky") return;
            onView({ ...opening, look: current.look });
            setMode("sky");
          }}
        >
          Sky view
        </button>
        <button
          type="button"
          aria-pressed={mode === "meteors"}
          onClick={() => {
            if (mode === "meteors") return;
            setModeLook(current.look);
            setMode("meteors");
          }}
        >
          Meteor Nights
        </button>
      </div>
      {mode === "meteors" ? (
        <MeteorNights city={city} view={view} initialLook={modeLook} onView={onView} />
      ) : (
        <>
          <div className="tonight-time">
            <div className="tonight-clock">
              <label htmlFor={rangeId}>City local time</label>
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
                {sky} · {above} {above === 1 ? "object" : "objects"} above the horizon
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
      )}
    </>
  );
}
