import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { eclipseFrom, greatestEclipse, localEclipse } from "../../geo/eclipse2027";
import { bearingLabel, type SkyCity, type TonightView } from "../../geo/tonight";
import { ObservationCredit } from "../observations/ObservationCredit";
import type { ObservationView } from "../observations/types";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { EclipseDisc } from "./EclipseDisc";
import {
  chaseEnd,
  chaseOverview,
  chasePose,
  chaseStart,
  durationLabel,
  luxor,
  shadowAt,
  totalityPath,
} from "./path";
import { elementsSource, pathSource } from "./pathData";
import { shadowMotion, useShadowClock } from "./useShadowClock";

const routes = [
  { name: "Atlantic", at: chaseStart },
  { name: "Gibraltar", at: Date.UTC(2027, 7, 2, 8, 48) },
  { name: "Greatest eclipse", at: greatestEclipse },
  { name: "Indian Ocean", at: Date.UTC(2027, 7, 2, 11, 32) },
];

const utc = (at: number) => `${new Date(at).toISOString().slice(11, 16)} UTC`;
const percentage = (cover: number) =>
  cover === 1 ? "100%" : `${Math.min(99.9, Math.round(cover * 1000) / 10)}%`;

export function ShadowChase({
  city,
  onView,
  onMap,
  onClose,
}: {
  city: SkyCity;
  onView: (view: ObservationView) => void;
  onMap: (map: boolean) => void;
  onClose: () => void;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<"globe" | "saved" | "luxor">("globe");
  const [earthMap, setEarthMap] = useState(false);
  const [landed, setLanded] = useState(false);
  const [entry, setEntry] = useState(() => (shadowMotion() ? chaseOverview : chasePose(chaseStart)));
  const observer = mode === "luxor" ? luxor : city;
  const local = mode !== "globe";
  const { reference, visible: circumstances } = useMemo(() => localEclipse(observer), [observer]);
  const site = useMemo(() => ({ lon: observer.lon, lat: observer.lat, zoom: 1.35 }), [observer]);
  const localClock = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: observer.zone,
        timeZoneName: "short",
      }),
    [observer.zone],
  );
  const pathClock = useShadowClock(chaseStart, chaseEnd, landed && !local, greatestEclipse);
  const skyClock = useShadowClock(
    circumstances?.start ?? reference,
    circumstances?.end ?? reference,
    landed && local,
    circumstances?.totality ? circumstances.peak : undefined,
  );
  const at = local ? skyClock.at : pathClock.at;
  const clock = local ? skyClock : pathClock;
  const start = local ? (circumstances?.start ?? reference) : chaseStart;
  const end = local ? (circumstances?.end ?? reference) : chaseEnd;
  const frame = eclipseFrom(at, observer);
  const point = shadowAt(at);
  const timeline = useId();
  const time = local ? localClock.format(at) : utc(at);
  const arrive = useCallback(() => setLanded(true), []);

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useObservatoryEscape(onClose);
  useLayoutEffect(() => onMap(!local && earthMap), [onMap, local, earthMap]);
  useLayoutEffect(() => {
    const sky: TonightView | undefined = local
      ? {
          kind: "tonight",
          at,
          city: observer,
          look: { azimuth: frame.azimuth, altitude: Math.max(0, frame.altitude) },
          bodies: [],
          sunCover: frame.cover,
        }
      : undefined;
    onView({
      kind: "observation",
      frame: local ? { at } : { at, paths: totalityPath },
      image: null,
      target: local ? site : entry,
      sky,
      arrive,
      shadow: local ? undefined : { point: shadowAt(at), pose: chasePose(at) },
    });
  }, [arrive, at, entry, frame.altitude, frame.azimuth, frame.cover, local, observer, onView, site]);

  function show(next: typeof mode) {
    if (next === mode) return;
    setLanded(false);
    if (next === "globe") {
      skyClock.seek(skyClock.at);
      setEntry(shadowMotion() ? chaseOverview : chasePose(pathClock.at));
    } else {
      pathClock.seek(pathClock.at);
      const location = next === "luxor" ? luxor : city;
      const prediction = localEclipse(location);
      skyClock.reset(prediction.reference);
    }
    setMode(next);
  }

  const event = circumstances?.totality
    ? "Total solar eclipse"
    : circumstances
      ? "Partial solar eclipse"
      : "No visible eclipse";
  const phase =
    frame.altitude < 0
      ? "Sun below the horizon"
      : frame.total
        ? "Totality"
        : frame.cover > 0
          ? `Partial phase · ${percentage(frame.cover)} covered`
          : "Sun unobscured";
  const coordinate = (value: number, negative: string, positive: string) =>
    `${Math.abs(value).toFixed(1)}°${value < 0 ? negative : positive}`;
  const position = `${coordinate(point.lat, "S", "N")} · ${coordinate(point.lon, "W", "E")}`;
  const canScrub = !local || !!circumstances;

  return (
    <>
      <div className="observatory-stage" data-stage="shadow" role="group" aria-label="Eclipse visualization">
        {local && frame.altitude >= 0 && (
          <div key={observer.name} className="shadow-sight">
            <EclipseDisc frame={frame} />
            <span>Sun close-up · celestial north up</span>
          </div>
        )}
        <div className="stage-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          <span>{local ? observer.name : earthMap ? "Path of totality · Map" : "Path of totality"}</span>
        </div>
        <div className="stage-readout shadow-readout">
          <span>
            {local
              ? phase
              : landed
                ? at === greatestEclipse
                  ? "Greatest eclipse"
                  : position
                : "Approaching the shadow"}
          </span>
          <span>{time}</span>
        </div>
      </div>
      <div className="observatory-sidebar">
        <section
          id="observatory-intro"
          className="observatory-intro observation-panel shadow-panel"
          aria-labelledby="shadow-title"
        >
          <div className="observation-heading">
            <h2 id="shadow-title">Shadow Chase</h2>
            <div className="observatory-actions">
              <button type="button" onClick={onClose} ref={back} aria-label="Back to After Dark">
                <span className="observation-back-full">Back to After Dark</span>
                <span className="observation-back-compact">After Dark</span>
              </button>
            </div>
          </div>
          <p className="observatory-description">
            2 August 2027 · A total solar eclipse crosses from the Atlantic to the Indian Ocean.
          </p>
          <div className="observatory-actions shadow-actions" role="group" aria-label="Eclipse viewpoint">
            <button type="button" aria-pressed={!local} onClick={() => show("globe")}>
              Follow the shadow
            </button>
            <button
              type="button"
              aria-pressed={local}
              onClick={() => show(mode === "luxor" ? "luxor" : "saved")}
            >
              From {observer.name}
            </button>
          </div>
          {!local && (
            <div className="observatory-actions shadow-actions" role="group" aria-label="Eclipse projection">
              <button type="button" aria-pressed={!earthMap} onClick={() => setEarthMap(false)}>
                Globe
              </button>
              <button type="button" aria-pressed={earthMap} onClick={() => setEarthMap(true)}>
                Map
              </button>
            </div>
          )}
          {canScrub && (
            <div className="shadow-timeline">
              <div className="shadow-timeline-row">
                <label htmlFor={timeline}>{local ? "Local eclipse time" : "Shadow time"}</label>
                <time dateTime={new Date(at).toISOString()}>{time}</time>
                <button
                  type="button"
                  onClick={() => {
                    if (local && !clock.playing && at === circumstances?.peak) clock.reset(start, true);
                    else clock.toggle();
                  }}
                >
                  {clock.playing ? "Pause" : at >= end ? "Replay" : "Play"}
                </button>
              </div>
              <input
                id={timeline}
                type="range"
                className="scrub-slider"
                min={0}
                max={Math.ceil((end - start) / 1000)}
                value={Math.round((at - start) / 1000)}
                step={1}
                aria-valuetext={time}
                onChange={(e) => clock.seek(Math.min(end, start + e.currentTarget.valueAsNumber * 1000))}
                onKeyDown={(e) => {
                  if (
                    e.key !== "ArrowLeft" &&
                    e.key !== "ArrowRight" &&
                    e.key !== "ArrowDown" &&
                    e.key !== "ArrowUp"
                  )
                    return;
                  e.preventDefault();
                  const dir = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 1;
                  clock.seek(Math.max(start, Math.min(end, at + dir * (local ? 15_000 : 120_000))));
                }}
              />
              <div className="observatory-actions shadow-actions">
                {local ? (
                  <button type="button" onClick={() => clock.seek(circumstances!.peak)}>
                    Peak eclipse
                  </button>
                ) : (
                  routes.map((stop) => (
                    <button key={stop.name} type="button" onClick={() => clock.seek(stop.at)}>
                      {stop.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          {local ? (
            <>
              <div className="shadow-summary">
                <h3>
                  {event} in {observer.name}
                </h3>
                {circumstances ? (
                  <dl className="observation-values">
                    <div>
                      <dt>Peak local time</dt>
                      <dd>{localClock.format(circumstances.peak)}</dd>
                    </div>
                    <div>
                      <dt>Sun covered at peak</dt>
                      <dd>{percentage(circumstances.cover)}</dd>
                    </div>
                    {circumstances.totality && (
                      <div>
                        <dt>Totality</dt>
                        <dd>
                          {durationLabel((circumstances.totality[1] - circumstances.totality[0]) / 1000)}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Sun position now</dt>
                      <dd>
                        {Math.round(frame.altitude)}° · {bearingLabel(frame.azimuth)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="observation-note">
                    From {observer.name}, the Moon won’t cover the Sun above the horizon during this eclipse.
                  </p>
                )}
              </div>
              {city.name !== luxor.name && (
                <div className="observatory-actions shadow-actions">
                  <button type="button" onClick={() => show(mode === "luxor" ? "saved" : "luxor")}>
                    {mode === "luxor" ? `Back to ${city.name}` : "Preview totality in Luxor"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <dl className="observation-values shadow-summary">
              <div>
                <dt>Path width</dt>
                <dd>{Math.round(point.width)} km</dd>
              </div>
              <div>
                <dt>Totality on the centerline</dt>
                <dd>{durationLabel(point.duration)}</dd>
              </div>
            </dl>
          )}
          <details className="shadow-sources">
            <summary>Prediction data and viewing safety</summary>
            <p className="observation-note">
              Eclipse Predictions by Fred Espenak, NASA’s GSFC. The globe follows NASA’s two-minute path
              samples. City estimates use NASA’s Besselian elements at sea level with a geometric horizon. The
              corona illustration is schematic. Use NASA’s guidance for safe viewing.
            </p>
            <div className="shadow-links">
              <a href={pathSource} target="_blank" rel="noreferrer">
                NASA path table
              </a>
              <a href={elementsSource} target="_blank" rel="noreferrer">
                NASA prediction map
              </a>
              <a
                href="https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/safety/"
                target="_blank"
                rel="noreferrer"
              >
                NASA viewing safety
              </a>
            </div>
          </details>
        </section>
        <ObservationCredit />
      </div>
    </>
  );
}
