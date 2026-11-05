import { Fragment, useLayoutEffect, type RefObject, type CSSProperties } from "react";
import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";
import { geographicCoordinates } from "../globe/orbitReadout";

interface Props {
  scene: EarthScene;
  ready: boolean;
  waiting: boolean;
  summary: string;
  feedNote: string | null;
  deepAvailable: boolean;
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

const SCENES = [
  { id: "live", name: "Live Earth", note: "A wider view of what's happening." },
  { id: "depth", name: "Below the Surface", note: "Recorded depths, opened into view." },
  { id: "night", name: "After Dark", note: "The night side, under the actual sky." },
] as const;

export function Observatory({
  scene,
  ready,
  waiting,
  summary,
  deepAvailable,
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
        ? "The other side of day."
        : "Meanwhile, on Earth.";
  const description = active
    ? (tour.stop?.description ?? "Travelling to the next view. The story begins when the camera arrives.")
    : scene === "depth"
      ? "An opening into reported earthquake depths. Reference rings run every 300 km to 900 km; the faint points trace historical seismicity."
      : scene === "night"
        ? "Sunlight gives way to the night side. The stars and their constellations follow the time shown in this view."
        : "A live view of earthquakes, changing skies, and a restless planet.";
  return (
    <section
      className="observatory-intro"
      ref={tour.controls}
      data-scene={active ? "tour" : scene}
      aria-label="Earth observatory"
    >
      <div className="observatory-story" aria-live="polite" aria-atomic="true">
        <p className="observatory-eyebrow">
          {active
            ? `A closer look · ${Math.min((tour.at ?? 0) + 1, tour.length)} / ${tour.length}`
            : "A window onto our planet"}
        </p>
        <h2 key={title} aria-label={title}>
          {title.split(" ").map((word, index, words) => (
            <Fragment key={index}>
              <span
                aria-hidden="true"
                className="observatory-word"
                style={{ "--word-index": index } as CSSProperties}
              >
                {word}
              </span>
              {index + 1 < words.length ? " " : null}
            </Fragment>
          ))}
        </h2>
        <p key={description} className="observatory-description">
          {description}
        </p>
        {active && tour.stop ? (
          <p className="observatory-location" data-tour-location={`${tour.stop.lon},${tour.stop.lat}`}>
            {tour.stop.name} <span>{geographicCoordinates(tour.stop)}</span>
          </p>
        ) : null}
      </div>
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
            <button type="button" onClick={onExplore} className="observatory-primary">
              Explore the globe <span aria-hidden="true">↗</span>
            </button>
            <button type="button" ref={tour.button} onClick={tour.start} disabled={!ready || !tour.available}>
              Take a tour <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="observatory-summary">
            {waiting
              ? feedNote
                ? "Earthquake readings aren’t available yet. Explore for feed status."
                : "Listening for the public feeds…"
              : summary}
          </p>
        </>
      )}
      {!active ? (
        <>
          <div className="observatory-scenes" role="group" aria-label="Earth scenes">
            {SCENES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onScene(option.id)}
                aria-pressed={!active && scene === option.id}
                disabled={!ready || (option.id === "depth" && !deepAvailable)}
                title={
                  option.id === "depth" && !deepAvailable
                    ? "No earthquake at least 70 km deep is present in this view."
                    : option.note
                }
              >
                <span className="scene-symbol" data-scene={option.id} aria-hidden="true" />
                {option.name}
              </button>
            ))}
          </div>{" "}
        </>
      ) : null}

      {!active && scene === "live" ? (
        <details className="observatory-history">
          <summary>Revisit a day</summary>
          <div className="observatory-history-links">
            <button type="button" onClick={() => onHistory("2011-03-11")}>
              Japan, 2011 ↗
            </button>
            <button type="button" onClick={() => onHistory("2013-05-24")}>
              Deep beneath Okhotsk ↗
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
  );
}
