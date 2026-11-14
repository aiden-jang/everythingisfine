import { PlaybackButton } from "../PlaybackButton";
import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import {
  aimAt,
  bearingLabel,
  skyBodies,
  type SkyCity,
  type SkyLook,
  type TonightView,
} from "../../geo/tonight";
import { meteorCalendar, meteorDate, nextMeteor, type MeteorShower } from "./meteorCalendar";
import { meteorNight, radiantLook } from "./meteorSky";

const MINUTE = 60_000;

function skyFrame(
  city: SkyCity,
  shower: MeteorShower,
  at: number,
  radiantTrail: readonly SkyLook[],
  look?: SkyLook,
): TonightView {
  const radiant = {
    ...radiantLook(city, shower, at),
    name: `${shower.name} radiant`,
    magnitude: 0,
    lit: null,
  };
  return {
    kind: "tonight",
    city,
    at,
    look: look ?? aimAt(radiant),
    bodies: [...skyBodies(city, at), radiant],
    targetName: radiant.name,
    radiantTrail,
  };
}

export function MeteorNights({
  city,
  view,
  initialLook,
  onView,
}: {
  city: SkyCity;
  view: TonightView | null;
  initialLook: SkyLook | undefined;
  onView: (view: TonightView) => void;
}): JSX.Element {
  const [shower, select] = useState(() => nextMeteor(Date.now()) ?? meteorCalendar[0]);
  const [following, setFollowing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const range = useId();
  const night = useMemo(() => meteorNight(city, shower), [city, shower]);
  const trail = useMemo(
    () =>
      Array.from({ length: 65 }, (_, i) =>
        radiantLook(city, shower, night.start + ((night.end - night.start) * i) / 64),
      ),
    [city, shower, night],
  );
  const preferred = night.suggested ?? Math.round((night.start + night.end) / 120_000) * MINUTE;
  const at = view && view.at >= night.start && view.at <= night.end ? view.at : preferred;
  const radiant = radiantLook(city, shower, at);
  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat("en", {
        timeZone: city.zone,
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    [city.zone],
  );
  const inWindow = night.windows.some((window) => at >= window.start && at <= window.end);
  const describe = (time: number) => clock.format(time);
  const span = night.end - night.start;

  useLayoutEffect(() => {
    onView(skyFrame(city, shower, preferred, trail, initialLook));
  }, [city, shower, preferred, trail, initialLook, onView]);

  useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const start = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = Math.min(night.end, at + 8 * MINUTE);
        onView(skyFrame(city, shower, next, trail, following ? undefined : view?.look));
        if (next >= night.end) setPlaying(false);
      }, 130);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [playing, at, city, shower, night.end, trail, following, view?.look, onView]);

  return (
    <>
      <label className="tonight-city">
        <span>Shower</span>
        <select
          value={shower.day}
          onChange={(event) => {
            setPlaying(false);
            const choice = meteorCalendar.find(({ day }) => day === event.currentTarget.value);
            if (choice) select(choice);
          }}
        >
          {meteorCalendar.map((choice) => (
            <option key={choice.day} value={choice.day}>
              {choice.name} · {meteorDate.format(Date.parse(choice.day))}
            </option>
          ))}
        </select>
      </label>
      <div className="tonight-time">
        <div className="tonight-clock">
          <label htmlFor={range}>City local time</label>
          <time dateTime={new Date(at).toISOString()}>{describe(at)}</time>
        </div>
        <input
          className="scrub-slider tonight-scrub"
          id={range}
          type="range"
          min={0}
          max={Math.floor(span / MINUTE)}
          value={Math.round((at - night.start) / MINUTE)}
          aria-valuetext={describe(at)}
          onChange={(event) => {
            setPlaying(false);
            onView(
              skyFrame(
                city,
                shower,
                night.start + event.currentTarget.valueAsNumber * MINUTE,
                trail,
                following ? undefined : view?.look,
              ),
            );
          }}
        />
        <div className="meteor-window-track" aria-hidden="true">
          {night.windows.map((window) => (
            <span
              key={window.start}
              style={{
                left: `${(100 * (window.start - night.start)) / span}%`,
                width: `${(100 * (window.end - window.start)) / span}%`,
              }}
            />
          ))}
        </div>
        <div className="tonight-clock tonight-edges">
          <span>{describe(night.start)}</span>
          <span>{describe(night.end)}</span>
        </div>
      </div>
      <div className="observatory-actions meteor-actions">
        <PlaybackButton
          playing={playing}
          ended={at >= night.end}
          onClick={() => {
            if (!playing && at >= night.end)
              onView(skyFrame(city, shower, night.start, trail, following ? undefined : view?.look));
            setPlaying(!playing);
          }}
        />
        <button
          type="button"
          aria-pressed={following}
          onClick={() => {
            setFollowing(!following);
            if (!following) onView(skyFrame(city, shower, at, trail));
          }}
        >
          Follow the radiant
        </button>
        {night.suggested !== undefined && (
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              onView(skyFrame(city, shower, preferred, trail));
            }}
          >
            Jump to a dark window
          </button>
        )}
      </div>
      <p className="observation-note">
        {radiant.altitude > 0
          ? `Radiant ${Math.round(radiant.altitude)}° above the ${bearingLabel(radiant.azimuth)} horizon.`
          : "Radiant below the horizon."}{" "}
        {inWindow
          ? "Dark sky and Moon below the horizon."
          : night.windows.length
            ? "The lit sections mark dark, moon-free viewing windows."
            : "No dark, moon-free window with the radiant 10° or higher on this night."}
      </p>
      <p className="observation-note">
        The radiant is where the shower appears to come from. Look across the surrounding sky. Conditions are
        calculated for a level horizon and exclude clouds and light pollution.
      </p>
      <a className="observation-source" href="https://www.imo.net/calendar/" target="_blank" rel="noreferrer">
        International Meteor Organization · 2026 and 2027 calendars
      </a>
    </>
  );
}
