import type { CameraState } from "../../globe/controlsTypes";
import { ShareMoment } from "../observations/StorySession";
import { skyPosition, skyStoryMoment, type SkyPosition } from "./skyMoment";
import { ExperienceEnding } from "../journeys/ExperienceEnding";
import { lazy, Suspense, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  aimAt,
  localNight,
  moonsetBetween,
  openingSky,
  skyBodies,
  type TonightView,
} from "../../geo/tonight";
import type { LunarDeparture, TonightPresentation } from "../../globe/scenePresentation";
import { nightTrail } from "../../geo/nightTrail";
import { skyLight } from "./nightfall";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { TimelineTrack } from "../observations/TimelineTrack";
import { StoryDock } from "../observations/StoryDock";
import { SkyCityPicker, type SkyCityPreference } from "./SkyCityPicker";
import { MeteorNights } from "./MeteorNights";
import { SkyObjects } from "./SkyObjects";
import { skyDirection, skyTargets } from "./skyTargets";
import { skyCities } from "./cities";
import { moonfallShare } from "../moonfall/moonfallShare";

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
  return { ...origin, aim: { ...aim, nightTrail: undefined, lunarDeparture: origin } };
}

export function TonightSky({
  view,
  onView,
  onJourney,
  onLocalSky,
  onClose,
  preference,
  initialMode,
  initialPosition,
  nightfall = false,
  orbit,
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
  initialPosition: SkyPosition | undefined;
  nightfall?: boolean | undefined;
  orbit: boolean;
  returnLabel: string;
  readCamera: () => CameraState;
  projection: { map: boolean; setMap: (map: boolean) => void };
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const [openedAt] = useState(() => Date.now());
  const [mode, setMode] = useState(initialMode === "moonfall" ? "sky" : initialMode);
  const [meteorDeparture, setMeteorDeparture] = useState<TonightView | null>(null);
  const [observing, setObserving] = useState(Boolean(initialPosition) && !nightfall);
  const [arrivalCity, setArrivalCity] = useState(() =>
    nightfall ? skyCities.find(({ name }) => name === initialPosition?.city) : undefined,
  );
  const city = arrivalCity ?? preference.city;
  const initial = initialPosition?.city === city.name ? initialPosition : undefined;
  const entries = useStoryNavigation()?.library.saved;
  const night = useMemo(() => {
    const at = initial?.at ?? openedAt;
    const candidate = localNight(city, initial?.nightStart ?? at);
    return at < candidate.start && initial ? localNight(city, at - 12 * 3_600_000) : candidate;
  }, [city, openedAt, initial]);
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
    const base = { ...openingSky(city, night.start, night.end), nightStart: night.start };
    if (!initial || initial.at < night.start || initial.at > night.end) return base;
    const bodies = skyBodies(city, initial.at);
    return {
      ...base,
      at: initial.at,
      bodies,
      look: initial.look,
      ...(initial.target
        ? {
            targetName: initial.target,
            ...(initial.trail
              ? {
                  nightTrail: {
                    points: nightTrail(city, initial.target, night.start, night.end),
                    following: !!initial.following,
                  },
                }
              : {}),
          }
        : {}),
      ...(initial.reference ? { reference: initial.reference } : {}),
    };
  }, [city, night.start, night.end, initial]);
  const current = view?.city.name === city.name ? view : opening;
  const [departure, setDeparture] = useState(() =>
    view?.lunarDeparture
      ? { ...view.lunarDeparture, aim: view }
      : initialMode === "moonfall" || initial?.lunar
        ? depart(current, projection.map ? readCamera() : undefined)
        : null,
  );
  const at = current.at;
  const moonset = useMemo(() => moonsetBetween(city, night.start, night.end), [city, night.start, night.end]);
  const kept = entries?.flatMap(({ id, position }) =>
    id === "sky" && position.sky?.city === city.name
      ? [Math.floor((position.sky.at - night.start) / MINUTE)]
      : [],
  );
  const { target } = skyTargets(current.bodies);
  function findBody(body: TonightView["bodies"][number]) {
    const points =
      current.targetName === body.name && current.nightTrail
        ? current.nightTrail.points
        : nightTrail(city, body.name, night.start, night.end);
    setObserving(true);
    onLocalSky();
    onView({ ...current, look: aimAt(body), targetName: body.name, nightTrail: { points, following: true } });
  }
  const sky = skyLight(city, at, night);

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useLayoutEffect(() => {
    if (!departure && mode === "sky" && view?.city.name !== city.name) {
      onView(opening);
    }
  }, [view?.city.name, city.name, mode, opening, onView, departure]);
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
          <Moonfall sky={departure.aim} onView={onView} resume={initial?.lunar} />
        </Suspense>
        {view?.moonfall && (
          <ShareMoment
            current={() => skyStoryMoment("moonfall", skyPosition(view, false, false))}
            share={moonfallShare}
          />
        )}
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
          <h3>
            {arrivalCity
              ? `Nightfall in ${city.name}`
              : target
                ? `Look ${skyDirection(target.azimuth)}.`
                : "Move through the night."}
          </h3>
          <p>
            {arrivalCity
              ? "Begin at calculated local sunset. Move through the night or follow the Moon to Apollo 17."
              : target
                ? `${target.name === "Moon" ? "The Moon" : target.name} is above ${city.name}’s horizon. Start there, then move through the night.`
                : `The Moon and planets are below ${city.name}’s horizon at this time. Try another moment in the night.`}
          </p>
          <p className="tonight-invitation-context">
            {city.name} · <time dateTime={new Date(at).toISOString()}>{format.local.format(at)}</time>
            {!arrivalCity && " · Calculated sky"}
            {target && (
              <span>
                {arrivalCity && `${target.name} · `}
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
                  findBody(target);
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
      <SkyCityPicker
        city={city.name}
        select={(name) => {
          setArrivalCity(undefined);
          preference.select(name);
        }}
      />
      {mode === "meteors" ? (
        <MeteorNights
          city={city}
          view={view}
          initialLook={meteorDeparture?.city.name === city.name ? meteorDeparture.look : initial?.look}
          onView={onView}
        />
      ) : (
        <>
          <StoryDock label="Tonight’s Sky time" deferOnShortPhone={!observing}>
            <div className="tonight-time">
              <div className="tonight-clock">
                <label htmlFor={rangeId}>City local time</label>
                <time dateTime={new Date(at).toISOString()}>{format.local.format(at)}</time>
              </div>
              <TimelineTrack
                max={(night.end - night.start) / MINUTE}
                current={(at - night.start) / MINUTE}
                kept={kept}
              >
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
                    const bodies = skyBodies(city, at);
                    const followed =
                      current.nightTrail?.following &&
                      bodies.find((body) => body.name === current.targetName);
                    onView({
                      ...current,
                      at,
                      bodies,
                      look: followed && followed.altitude > 0 ? aimAt(followed) : current.look,
                    });
                    setObserving(true);
                  }}
                />
              </TimelineTrack>
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
          <SkyObjects
            current={current}
            sky={sky}
            onFind={findBody}
            moonset={
              moonset === null
                ? undefined
                : `${at < moonset ? "Sets at" : "Set at"} ${format.clock.format(moonset)}`
            }
          />
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
      {mode === "sky" && observing && (
        <ShareMoment
          current={() =>
            skyStoryMoment("sky", {
              ...skyPosition(current, projection.map, orbit),
              ...(projection.map || orbit ? { reference: readCamera() } : {}),
            })
          }
        />
      )}
      <ExperienceEnding id={mode} />
    </>
  );
}
