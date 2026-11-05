import { useLayoutEffect, type RefObject } from "react";
import { ObservatoryStage, OBSERVATORY_SCENES, SceneDiagram } from "./ObservatoryStage";
import { APRIL_ECLIPSE_DAY } from "../geo/aprilEclipse";
import { RuptureReveal, TOHOKU_DAY } from "./rupture/RuptureReveal";
import { StormReplay } from "./storm/StormReplay";
import { TongaReplay } from "./tonga/TongaReplay";
import { AuroraOverflightControls } from "./AuroraOverflightControls";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";
import { geographicCoordinates } from "../globe/orbitReadout";

interface Props {
  scene: EarthScene;
  at: number;
  ready: boolean;
  waiting: boolean;
  summary: string;
  feedNote: string | null;
  deepAvailable: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
  onScene: (scene: EarthScene) => void;
  onExplore: () => void;
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
  feedNote,
  onScene,
  onExplore,
  tour,
  onHistory,
}: Props): JSX.Element {
  useLayoutEffect(() => {
    tour.controls.current?.scrollTo(0, 0);
    tour.controls.current?.querySelector<HTMLElement>(".observatory-story")?.scrollTo(0, 0);
  }, [scene, tour.at, tour.controls]);
  const active = tour.at !== null;
  const title = active
    ? (tour.stop?.heading ?? "Taking the long way around.")
    : scene === "depth"
      ? "Beneath the surface."
      : scene === "night"
        ? aurora.run
          ? "Into the auroral oval."
          : "The other side of day."
        : "Meanwhile, on Earth.";
  const description = active
    ? (tour.stop?.description ?? "Travelling to the next view. The story begins when the camera arrives.")
    : scene === "depth"
      ? "Look through a regional cutaway at reported earthquake depths. The faint points show historical seismicity."
      : scene === "night"
        ? aurora.run
          ? "Follow NOAA’s forecast over Earth’s dark side. The raised glow illustrates the modeled oval."
          : "Earth settles into the horizon as constellations trace overhead. The sky follows the UTC readout."
        : "A live view of earthquakes, changing skies, and a restless planet.";
  return (
    <>
      <ObservatoryStage scene={scene} at={at} tour={active ? tour.stop : undefined} aurora={aurora.run} />
      <section
        className="observatory-intro"
        ref={tour.controls}
        data-scene={active ? "tour" : scene}
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
          <AuroraOverflightControls aurora={aurora} ready={ready} onReturn={() => onScene("night")} />
        ) : null}
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
                className={aurora.run ? undefined : "observatory-primary"}
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
                title={
                  option.id === "depth" && !deepAvailable
                    ? "No earthquake at least 70 km deep is present in this view."
                    : option.note
                }
              >
                <SceneDiagram scene={option.id} />
                <span className="scene-label">{option.name}</span>
                <span className="scene-note" aria-hidden="true">
                  {option.note}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!active && scene === "live" ? (
          <details className="observatory-history">
            <summary>Revisit a day</summary>
            <div className="observatory-history-links">
              <button type="button" onClick={() => onHistory(TOHOKU_DAY)}>
                Japan, 2011 ↗
              </button>
              <RuptureReveal />
              <StormReplay />
              <TongaReplay />
              <button type="button" onClick={() => onHistory("2013-05-24")}>
                Deep beneath Okhotsk ↗
              </button>
              <button type="button" onClick={() => onHistory(APRIL_ECLIPSE_DAY)}>
                Total eclipse, 2024 ↗
              </button>
            </div>
          </details>
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
    </>
  );
}
