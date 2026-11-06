import { lazy, Suspense, useLayoutEffect, type RefObject } from "react";
import { ObservatoryStage, OBSERVATORY_SCENES, SceneDiagram } from "./ObservatoryStage";
import { APRIL_ECLIPSE_DAY } from "../geo/aprilEclipse";
import { RuptureReveal, TOHOKU_DAY } from "./rupture/RuptureReveal";
import { StormReplay } from "./storm/StormReplay";
import { TongaReplay } from "./tonga/TongaReplay";
import { KilaueaReplay } from "./kilauea/KilaueaReplay";
import { IcebergReplay } from "./iceberg/IcebergReplay";
import { MegaflashReplay } from "./megaflash/MegaflashReplay";
import { StormRadar } from "./radar/StormRadar";
import { AuroraOverflightControls } from "./AuroraOverflightControls";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";
import { geographicCoordinates } from "../globe/orbitReadout";
import "./sun/sun-watch.css";

const SunWatch = lazy(() => import("./sun/SunWatch").then(({ SunWatch }) => ({ default: SunWatch })));

interface Props {
  scene: EarthScene;
  at: number;
  ready: boolean;
  waiting: boolean;
  summary: string;
  feedNote: string | null;
  deepAvailable: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
  sun: { active: boolean; toggle: () => void };
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
  waiting,
  summary,
  deepAvailable,
  aurora,
  sun,
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
  }, [scene, tour.at, tour.controls]);
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
  return (
    <>
      {!solar && (
        <ObservatoryStage scene={scene} at={at} tour={active ? tour.stop : undefined} aurora={aurora.run} />
      )}
      <section
        id="observatory-intro"
        tabIndex={-1}
        className="observatory-intro"
        ref={tour.controls}
        data-scene={active ? "tour" : scene}
        data-sun-watch={solar || undefined}
        aria-label="Earth observatory"
      >
        <div className="observatory-story" aria-live="polite" aria-atomic="true">
          <h2 key={title}>{title}</h2>
          <p key={description} className="observatory-description">
            {description}
          </p>
          {active && tour.stop ? (
            <p className="observatory-location" data-tour-location={`${tour.stop.lon},${tour.stop.lat}`}>
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
          />
        ) : null}
        {solar && (
          <div className="sun-credits" aria-label="Sun Watch sources">
            <a href="https://www.swpc.noaa.gov/products/solar-wind" target="_blank" rel="noreferrer">
              NOAA solar wind
            </a>
            <a href="https://www.swpc.noaa.gov/products/goes-x-ray-flux" target="_blank" rel="noreferrer">
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
              >
                Take a tour <span aria-hidden="true">→</span>
              </button>
              {scene === "live" && <StormRadar />}
            </div>
            {scene !== "night" ? (
              <p className="observatory-summary">
                {waiting
                  ? feedNote
                    ? "Earthquake readings aren’t available yet. Explore for feed status."
                    : "Listening for the public feeds…"
                  : summary}
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
            Below the Surface needs a quake at least 70 km deep.
          </p>
        )}
        {!active && scene === "live" ? (
          <div className="observatory-history">
            <details>
              <summary>Historical replays</summary>
              <div className="observatory-history-links">
                <button type="button" onClick={() => onHistory(TOHOKU_DAY)}>
                  Japan, 2011 ↗
                </button>
                <RuptureReveal />
                <StormReplay />
                <TongaReplay />
                <KilaueaReplay />
                <IcebergReplay />
                <MegaflashReplay />
                <button type="button" onClick={() => onHistory("2013-05-24")}>
                  Deep beneath Okhotsk ↗
                </button>
                <button type="button" onClick={() => onHistory(APRIL_ECLIPSE_DAY)}>
                  Total eclipse, 2024 ↗
                </button>
              </div>
            </details>
            <button type="button" onClick={onPickDate}>
              Pick a past date
            </button>
          </div>
        ) : null}
        {feedNote ? (
          <p className="observatory-source-note" role="status">
            {feedNote}
          </p>
        ) : null}
        <p className="observatory-credit">
          An observatory by{" "}
          <a
            href="https://www.aidenjang.com"
            target="_blank"
            rel="noreferrer"
            aria-describedby="external-link-hint"
          >
            aiden jang
          </a>
        </p>
      </section>
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
