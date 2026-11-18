import type { CameraState } from "../../globe/controlsTypes";
import type { MoonfallProgress } from "../../globe/moonfall/scene";
import { ExperienceEnding } from "../journeys/ExperienceEnding";
import { lazy, Suspense, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { aimAt, localNight, openingSky, skyBodies, type SkyLook, type TonightView } from "../../geo/tonight";
import type { LunarDeparture, TonightPresentation } from "../../globe/scenePresentation";
import { sunElevation } from "../../geo/sun";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { StoryDock } from "../observations/StoryDock";
import { SkyCityPicker, type SkyCityPreference } from "./SkyCityPicker";
import { MeteorNights } from "./MeteorNights";
import { SkyObjects } from "./SkyObjects";
import { skyDirection, skyTargets } from "./skyTargets";

const MINUTE = 60_000;
const Moonfall = lazy(() => import("../moonfall/Moonfall").then(({ Moonfall }) => ({ default: Moonfall })));

function depart(view: TonightView, camera?: CameraState) {
  const moon = view.bodies[0]!;
  const origin: LunarDeparture = {
    previous: view,
    camera,
    scroll: document.getElementById("observatory-intro")?.scrollTop ?? 0,
  };
  const aim = moon.altitude > 0 ? { ...view, look: aimAt(moon), targetName: moon.name } : view;
  return { ...origin, aim: { ...aim, lunarDeparture: origin } };
}

export function TonightSky({
  view,
  onView,
  onJourney,
  onLocalSky,
  onClose,
  preference,
  initialMode,
  initialLunar,
  initialLook,
  initialMoment,
  returnLabel,
  projection,
  readCamera,
}: {
  view: TonightPresentation | null;
  onView: (next: TonightPresentation) => void;
  onJourney: (next: TonightPresentation) => void;
  onLocalSky: () => void;
  onClose: () => void;
  preference: SkyCityPreference;
  initialMode: "sky" | "meteors" | "moonfall";
  initialLunar?: MoonfallProgress | undefined;
  initialLook: SkyLook | undefined;
  initialMoment: { city: string; at: number } | undefined;
  returnLabel: string;
  readCamera: () => CameraState;
  projection: { map: boolean; setMap: (map: boolean) => void };
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const [openedAt] = useState(() => Date.now());
  const [mode, setMode] = useState(initialMode === "moonfall" ? "sky" : initialMode);
  const [meteorDeparture, setMeteorDeparture] = useState<TonightView | null>(null);
  const [observing, setObserving] = useState(Boolean(initialMoment || initialLook));
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
    view?.lunarDeparture
      ? { ...view.lunarDeparture, aim: view }
      : initialMode === "moonfall" || initialLunar
        ? depart(current, projection.map ? readCamera() : undefined)
        : null,
  );
  const at = current.at;
  const { target } = skyTargets(current.bodies);
  const sun = sunElevation(city.lon, city.lat, at);
  const pointAtSky = (next: TonightView) => {
    onLocalSky();
    onView(next);
  };
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
    const { previous, camera, scroll } = departure;
    onJourney(camera ? { ...previous, reference: camera } : previous);
    projection.setMap(!!camera);
    setDeparture(null);
    requestAnimationFrame(() => {
      document.getElementById("observatory-intro")?.scrollTo(0, scroll);
      document.getElementById("open-moonfall")?.focus({ preventScroll: true });
    });
  };
  useLayoutEffect(() => {
    if (departure) document.getElementById("moonfall-back")?.focus({ preventScroll: true });
  }, [departure]);
  useObservatoryEscape(departure ? returnToSky : onClose);

  function approachMoon() {
    const flight = depart(current, projection.map ? readCamera() : undefined);
    setDeparture(flight);
    onJourney(flight.aim);
  }

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
      {mode === "sky" && !observing && (
        <section className="tonight-invitation" aria-label="Start observing">
          <h3>{target ? `Look ${skyDirection(target.azimuth)}.` : "Move through the night."}</h3>
          <p>
            {target
              ? `${target.name === "Moon" ? "The Moon" : target.name} is above ${city.name}’s horizon. Start there, then move through the night.`
              : `The Moon and planets are below ${city.name}’s horizon at this time. Try another moment in the night.`}
          </p>
          <p className="tonight-invitation-context">
            {city.name} · {format.local.format(at)} · Calculated sky
            {target && (
              <span>
                {Math.round(target.altitude)}° above horizon · {Math.round(target.azimuth) % 360}° bearing
              </span>
            )}
          </p>
          <div className="observatory-actions">
            {target && (
              <button
                type="button"
                className="tonight-find"
                onClick={() => {
                  pointAtSky({ ...current, look: aimAt(target), targetName: target.name });
                  setObserving(true);
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLButtonElement>(".tonight-objects button")?.focus(),
                  );
                }}
              >
                Find {target.name === "Moon" ? "the Moon" : target.name}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setObserving(true);
                requestAnimationFrame(() =>
                  document.querySelector<HTMLSelectElement>(".tonight-city select")?.focus(),
                );
              }}
            >
              Change city or night
            </button>
          </div>
        </section>
      )}
      {mode === "sky" && (
        <div className="tonight-moonfall-entry">
          <button type="button" id="open-moonfall" onClick={approachMoon}>
            <strong>{current.bodies[0]!.altitude > 0 ? "Approach the Moon" : "Visit Apollo 17"}</strong>
            <span>Moonfall · Taurus–Littrow</span>
          </button>
        </div>
      )}
      <SkyCityPicker city={city.name} select={preference.select} />
      {mode === "meteors" ? (
        <MeteorNights
          city={city}
          view={view}
          initialLook={meteorDeparture?.city.name === city.name ? meteorDeparture.look : initialLook}
          onView={onView}
        />
      ) : (
        <>
          <StoryDock label="Tonight’s Sky time">
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
                  setObserving(true);
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
          </StoryDock>
          <SkyObjects current={current} sky={sky} onView={pointAtSky} />
        </>
      )}
      <div className="tonight-onward">
        <p>{mode === "sky" ? "Explore another sky experience" : "Return to your observing moment"}</p>
        <div className="observatory-actions tonight-mode" role="group" aria-label="Local sky view">
          <button
            type="button"
            aria-pressed={mode === "sky"}
            onClick={() => {
              if (mode === "sky") return;
              onView(meteorDeparture?.city.name === city.name ? meteorDeparture : opening);
              setMode("sky");
              setObserving(true);
            }}
          >
            Sky view
          </button>
          <button
            type="button"
            aria-pressed={mode === "meteors"}
            onClick={() => {
              if (mode === "meteors") return;
              setMeteorDeparture(current);
              setMode("meteors");
            }}
          >
            Meteor Nights
          </button>
        </div>
      </div>
      <ExperienceEnding id={mode} />
    </>
  );
}
