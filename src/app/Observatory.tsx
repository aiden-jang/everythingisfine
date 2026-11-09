import { lazy, Suspense, useLayoutEffect, type RefObject } from "react";
import { ObservatoryStage, OBSERVATORY_SCENES, SceneDiagram } from "./ObservatoryStage";
import { ObservatoryHistory } from "./ObservatoryHistory";
import { MoonfallReadout } from "./moonfall/MoonfallReadout";
import { FloatReadout } from "./float/FloatReadout";
import { RadarReadout, StormRadar } from "./radar/StormRadar";
import { AuroraOverflightControls } from "./AuroraOverflightControls";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { EarthScene, useObservatory } from "./useObservatory";
import type { Stop } from "./tour";
import { geographicCoordinates } from "../globe/orbitReadout";
import "./sun/sun-watch.css";
import "./tonight/tonight.css";
import "./float/float-dive.css";
import "./moonfall/moonfall.css";
import { ObservationCredit } from "./observations/ObservationCredit";
import { LiveExperiences, ObservationDeckShell } from "./observations/ObservationEntry";

const SunWatch = lazy(() => import("./sun/SunWatch").then(({ SunWatch }) => ({ default: SunWatch })));

const TonightSky = lazy(() =>
  import("./tonight/TonightSky").then(({ TonightSky }) => ({ default: TonightSky })),
);
const TonightCompass = lazy(() =>
  import("./tonight/TonightCompass").then(({ TonightCompass }) => ({ default: TonightCompass })),
);

const FloatDive = lazy(() =>
  import("./float/FloatDivePanel").then(({ FloatDivePanel }) => ({ default: FloatDivePanel })),
);

interface Props {
  scene: EarthScene;
  at: number;
  ready: boolean;
  empty: ReturnType<typeof import("./earthquakeStatus").earthquakeEmpty>;
  summary: string;
  feedNote: string | null;
  deepAvailable: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
  views: Pick<
    ReturnType<typeof useObservatory>,
    "sun" | "tonight" | "floatDive" | "observations" | "skyCity" | "openLights"
  >;
  radar: ReturnType<typeof useObservatory>["radar"];
  onScene: (scene: EarthScene) => void;
  onExplore: () => void;
  onPickDate: () => void;
  tour: {
    at: number | null;
    stop: Stop | null;
    length: number;
    paused: boolean;
    button: RefObject<HTMLButtonElement>;
    controls: RefObject<HTMLElement>;
    start: () => void;
    stopTour: () => void;
    next: () => void;
    previous: () => void;
    pause: () => void;
    available: boolean;
    inspect: (() => void) | null;
  };
  onHistory: (day: string) => void;
}

export function Observatory({
  scene,
  at,
  ready,
  empty,
  summary,
  deepAvailable,
  aurora,
  views: { sun, tonight, floatDive, observations, skyCity, openLights },
  radar,
  feedNote,
  onScene,
  onExplore,
  onPickDate,
  tour,
  onHistory,
}: Props): JSX.Element {
  useLayoutEffect(() => {
    tour.controls.current?.scrollTo(0, 0);
    tour.controls.current?.querySelector<HTMLElement>(".observatory-story")?.scrollTo(0, 0);
  }, [scene, tour.at, tour.controls, radar.active, tonight.active, floatDive.active]);
  const localTitle = floatDive.active
    ? "Float Dive"
    : radar.active
      ? "Storm Radar"
      : tonight.active
        ? tonight.entry.mode === "meteors"
          ? "Meteor Nights"
          : "Tonight’s Sky"
        : "Earth observatory";
  const active = tour.at !== null;
  const solar = sun.active && !active;
  const title = active
    ? (tour.stop?.heading ?? "Taking the long way around.")
    : scene === "depth"
      ? "Beneath the surface."
      : scene === "night"
        ? solar
          ? "Sun Watch"
          : aurora.run
            ? "Into the auroral oval."
            : "The other side of day."
        : "Meanwhile, on Earth.";
  const description = active
    ? (tour.stop?.description ?? "Travelling to the next view. The story begins when the camera arrives.")
    : scene === "depth"
      ? "Look through a regional cutaway at reported earthquake depths. The faint points show historical seismicity."
      : scene === "night"
        ? solar
          ? "See what GOES measures in X-rays and what spacecraft sample in the solar wind upstream of Earth. Aurora has its own forecast."
          : aurora.run
            ? "Follow NOAA’s forecast over Earth’s dark side. The raised glow illustrates the modeled oval."
            : "Earth settles into the horizon as constellations trace overhead. The sky follows the UTC readout."
        : "A live view of earthquakes, changing skies, and a restless planet.";
  if (observations.entry)
    return (
      <ObservationDeckShell deck={observations} entry={observations.entry} scene={scene} city={skyCity} />
    );
  return (
    <>
      {floatDive.active ? (
        <FloatReadout view={floatDive.view} />
      ) : radar.active ? (
        <RadarReadout map={observations.map} />
      ) : tonight.view?.moonfall ? (
        <MoonfallReadout view={tonight.view.moonfall} />
      ) : tonight.active ? (
        <Suspense fallback={null}>
          <TonightCompass view={tonight.view} onView={tonight.update} />
        </Suspense>
      ) : (
        !solar && (
          <ObservatoryStage scene={scene} at={at} tour={active ? tour.stop : undefined} aurora={aurora.run} />
        )
      )}
      <div className="observatory-sidebar">
        <section
          id="observatory-intro"
          tabIndex={-1}
          className="observatory-intro"
          ref={tour.controls}
          data-scene={active ? "tour" : scene}
          data-sun-watch={solar || undefined}
          data-storm-radar={radar.active || undefined}
          data-tonight={tonight.active || undefined}
          data-float-dive={floatDive.active || undefined}
          aria-label={localTitle}
          aria-labelledby={tonight.active ? "local-sky-title" : undefined}
        >
          {floatDive.active ? (
            <Suspense fallback={<p role="status">Opening Float Dive…</p>}>
              <FloatDive
                view={floatDive.view}
                onView={floatDive.update}
                onClose={() => {
                  floatDive.close();
                  requestAnimationFrame(() => document.getElementById("open-float-dive")?.focus());
                }}
              />
            </Suspense>
          ) : radar.active ? (
            <StormRadar
              projection={observations}
              fromExplore={radar.fromExplore}
              onView={radar.update}
              onClose={() => {
                radar.close();
                const trigger = radar.fromExplore ? "open-explorer-radar" : "open-storm-radar";
                requestAnimationFrame(() => document.getElementById(trigger)?.focus());
              }}
            />
          ) : tonight.active ? (
            <Suspense fallback={<p role="status">Opening Tonight’s Sky…</p>}>
              <TonightSky
                view={tonight.view}
                onView={tonight.update}
                preference={skyCity}
                initialMode={tonight.entry.mode}
                initialLook={tonight.entry.look}
                onClose={() => {
                  tonight.close();
                  const id = tonight.entry.mode === "meteors" ? "open-meteor-nights" : "open-tonight-sky";
                  requestAnimationFrame(() => document.getElementById(id)?.focus());
                }}
              />
            </Suspense>
          ) : (
            <>
              <div className="observatory-story" aria-live="polite" aria-atomic="true">
                <h2 key={title}>{title}</h2>
                <p key={description} className="observatory-description">
                  {description}
                </p>
                {active && tour.stop ? (
                  <p
                    className="observatory-location"
                    data-tour-location={`${tour.stop.lon},${tour.stop.lat}`}
                  >
                    {tour.stop.name}{" "}
                    <span>
                      {geographicCoordinates(tour.stop)} · Stop {Math.min((tour.at ?? 0) + 1, tour.length)} of{" "}
                      {tour.length}
                    </span>
                  </p>
                ) : null}
              </div>
              {!active && scene === "night" ? (
                <AuroraOverflightControls
                  aurora={aurora}
                  ready={ready}
                  solar={solar}
                  onReturn={() => onScene("night")}
                  onSunWatch={sun.toggle}
                  onTonight={() => tonight.open()}
                  onOrbit={() => observations.open("orbit", "open-orbital-pass")}
                  onMeteors={() => tonight.open("meteors")}
                  onLights={openLights}
                  city={skyCity}
                />
              ) : null}
              {solar && (
                <div className="sun-credits" aria-label="Sun Watch sources">
                  <a href="https://www.swpc.noaa.gov/products/solar-wind" target="_blank" rel="noreferrer">
                    NOAA solar wind
                  </a>
                  <a
                    href="https://www.swpc.noaa.gov/products/goes-x-ray-flux"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GOES X-rays
                  </a>
                  <a
                    href="https://www.jpl.nasa.gov/images/pia26681-image-of-sun-from-nasas-solar-dynamics-observatory/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA/GSFC/SDO image
                  </a>
                </div>
              )}
              {active ? (
                <div className="observatory-tour-controls">
                  <div className="observatory-tour-step">
                    <button
                      type="button"
                      onClick={tour.previous}
                      disabled={tour.at === 0}
                      aria-label="Previous tour stop"
                    >
                      ←
                    </button>
                    <button type="button" onClick={tour.pause}>
                      {tour.paused ? "Resume tour" : "Pause tour"}
                    </button>
                    <button
                      type="button"
                      onClick={tour.next}
                      aria-label={(tour.at ?? 0) + 1 >= tour.length ? "Finish tour" : "Next tour stop"}
                    >
                      →
                    </button>
                  </div>
                  <div className="observatory-actions">
                    <button type="button" ref={tour.button} onClick={tour.stopTour}>
                      Stop
                    </button>
                    {tour.inspect ? (
                      <button type="button" onClick={tour.inspect}>
                        Read this event ↗
                      </button>
                    ) : (
                      <button type="button" onClick={onExplore}>
                        Explore this view ↗
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="observatory-actions">
                    <button
                      type="button"
                      onClick={onExplore}
                      className={aurora.run || solar ? undefined : "observatory-primary"}
                    >
                      Explore the globe <span aria-hidden="true">↗</span>
                    </button>
                    <button
                      type="button"
                      ref={tour.button}
                      onClick={tour.start}
                      disabled={!ready || !tour.available}
                      aria-describedby={ready && !tour.available ? "tour-availability" : undefined}
                    >
                      Take a tour <span aria-hidden="true">→</span>
                    </button>
                    {ready && !tour.available && scene === "night" && (
                      <p id="tour-availability" className="observatory-summary">
                        {empty.text}
                      </p>
                    )}
                    {scene === "live" && (
                      <LiveExperiences
                        ready={ready}
                        radar={radar.open}
                        dive={floatDive.open}
                        more={observations.open}
                        epic={() => observations.open("epic", "open-epic")}
                      />
                    )}
                    {scene === "depth" && (
                      <button
                        type="button"
                        id="open-deep-time"
                        disabled={!ready}
                        onClick={() => observations.open("deep", "open-deep-time")}
                      >
                        Deep Time
                      </button>
                    )}
                  </div>
                  {scene !== "night" ? (
                    <p
                      id={ready && !tour.available ? "tour-availability" : undefined}
                      className="observatory-summary"
                    >
                      {summary}
                    </p>
                  ) : null}
                </>
              )}
              {!active ? (
                <div className="observatory-scenes" role="group" aria-label="Earth scenes">
                  {OBSERVATORY_SCENES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onScene(option.id)}
                      aria-pressed={scene === option.id}
                      aria-label={option.name}
                      disabled={!ready || (option.id === "depth" && !deepAvailable)}
                      aria-describedby={
                        option.id === "depth" && ready && !deepAvailable ? "depth-availability" : undefined
                      }
                    >
                      <SceneDiagram scene={option.id} />
                      <span className="scene-label">{option.name}</span>
                      <span className="scene-note">{option.note}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {!active && ready && !deepAvailable && (
                <p id="depth-availability" className="observatory-depth-note">
                  Below the Surface needs an earthquake at least 70 km deep in the current view.
                </p>
              )}
              {!active && scene === "live" ? (
                <ObservatoryHistory onHistory={onHistory} onPickDate={onPickDate} />
              ) : null}
              {feedNote ? (
                <p className="observatory-source-note" role="status">
                  {feedNote}
                </p>
              ) : null}
            </>
          )}
        </section>
        <ObservationCredit />
      </div>
      {solar && (
        <Suspense
          fallback={
            <div className="observatory-stage sun-watch-loading" role="status">
              Opening Sun Watch…
            </div>
          }
        >
          <SunWatch
            onClose={() => {
              sun.toggle();
              tour.controls.current?.querySelector<HTMLButtonElement>("[data-sun-toggle]")?.focus();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
