import type { MoonfallProgress } from "../../globe/moonfall/scene";
import { ExperienceEnding } from "../journeys/ExperienceEnding";
import { lazy, Suspense, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  aimAt,
  bearingLabel,
  localNight,
  openingSky,
  skyBodies,
  type SkyLook,
  type TonightView,
} from "../../geo/tonight";
import type { TonightPresentation } from "../../globe/scenePresentation";
import { sunElevation } from "../../geo/sun";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { SkyCityPicker, type SkyCityPreference } from "./SkyCityPicker";
import { MeteorNights } from "./MeteorNights";

const MINUTE = 60_000;
const Moonfall = lazy(() => import("../moonfall/Moonfall").then(({ Moonfall }) => ({ default: Moonfall })));

function depart(view: TonightView) {
  const moon = view.bodies[0]!;
  return {
    previous: view,
    aim: moon.altitude > 0 ? { ...view, look: aimAt(moon), targetName: moon.name } : view,
  };
}

export function TonightSky({
  view,
  onView,
  onClose,
  preference,
  initialMode,
  initialLunar,
  initialLook,
  initialMoment,
  returnLabel,
}: {
  view: TonightView | null;
  onView: (next: TonightPresentation) => void;
  onClose: () => void;
  preference: SkyCityPreference;
  initialMode: "sky" | "meteors" | "moonfall";
  initialLunar?: MoonfallProgress | undefined;
  initialLook: SkyLook | undefined;
  initialMoment: { city: string; at: number } | undefined;
  returnLabel: string;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const [openedAt] = useState(() => Date.now());
  const [mode, setMode] = useState(initialMode === "moonfall" ? "sky" : initialMode);
  const [modeLook, setModeLook] = useState(initialLook);
  const { city } = preference;
  const night = useMemo(() => {
    const at = initialMoment?.city === city.name ? initialMoment.at : openedAt;
    const candidate = localNight(city, at);
    return at < candidate.start && initialMoment?.city === city.name
      ? localNight(city, at - 12 * 3_600_000)
      : candidate;
  }, [city, openedAt, initialMoment]);
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
  const opening = useMemo(() => {
    const base = openingSky(city, night.start, night.end);
    const saved = initialMoment?.city === city.name ? initialMoment.at : undefined;
    return saved !== undefined && saved >= night.start && saved <= night.end
      ? { ...base, at: saved, bodies: skyBodies(city, saved) }
      : base;
  }, [city, night.start, night.end, initialMoment]);
  const current = view?.city.name === city.name ? view : { ...opening, look: initialLook ?? opening.look };
  const [departure, setDeparture] = useState(() =>
    initialMode === "moonfall" || initialLunar ? depart(current) : null,
  );
  const at = current.at;
  const readings = current.bodies;
  const above = readings.filter((body) => body.altitude > 0).length;
  const sun = sunElevation(city.lon, city.lat, at);
  const sky = sun >= -0.833 ? "Daylight" : sun > -18 ? "Twilight" : "Dark sky";

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useLayoutEffect(() => {
    if (!departure && mode === "sky" && view?.city.name !== city.name) {
      onView({ ...opening, look: initialLook ?? opening.look });
    }
  }, [view?.city.name, city.name, mode, opening, initialLook, onView, departure]);
  const returnToSky = () => {
    if (!departure) return;
    if (initialMode === "moonfall") {
      onClose();
      return;
    }
    onView(departure.previous);
    setDeparture(null);
    requestAnimationFrame(() => document.getElementById("open-moonfall")?.focus());
  };
  useLayoutEffect(() => {
    if (departure) document.getElementById("moonfall-back")?.focus({ preventScroll: true });
  }, [departure]);
  useObservatoryEscape(departure ? returnToSky : onClose);

  if (departure) {
    return (
      <>
        <div className="tonight-heading" data-moonfall-panel="">
          <h2 id="local-sky-title">Moonfall</h2>
          <div className="observatory-actions tonight-back">
            <button type="button" id="moonfall-back" onClick={returnToSky}>
              {initialMode === "moonfall" ? returnLabel : "Back to Tonight’s Sky"}
            </button>
          </div>
        </div>
        <Suspense fallback={<p role="status">Loading the lunar survey…</p>}>
          <Moonfall sky={departure.aim} onView={onView} resume={initialLunar} />
        </Suspense>
        <ExperienceEnding id="moonfall" />
      </>
    );
  }

  return (
    <>
      <div className="tonight-heading">
        <h2 id="local-sky-title">{mode === "sky" ? "Tonight’s Sky" : "Meteor Nights"}</h2>
        <div className="observatory-actions tonight-back">
          <button type="button" ref={back} onClick={onClose}>
            {returnLabel}
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
        {mode === "sky" && (
          <button
            type="button"
            id="open-moonfall"
            onClick={() => {
              const flight = depart(current);
              setDeparture(flight);
              onView(flight.aim);
            }}
          >
            Moonfall
          </button>
        )}
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
      <ExperienceEnding id={mode} />
    </>
  );
}
