import { StoryProjection } from "./observations/StoryProjection";
import { reportAnalytics } from "../../analytics/browser";
import { SceneDiagram } from "./SceneDiagram";
import { geographicCoordinates } from "../globe/orbitReadout";
import { CUTAWAY_GUIDES_KM } from "../globe/cutawayScale";
import { subsolarPoint } from "../geo/sun";
import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";
import type { AuroraRun } from "../sources/auroraRoute";
import type { ReactNode } from "react";
import "./scene-cues.css";

export const OBSERVATORY_SCENES = [
  { id: "live", name: "Earth" },
  { id: "depth", name: "Below the Surface" },
  { id: "night", name: "After Dark" },
] as const;

export function ObservatoryStage({
  scene,
  at,
  tour,
  aurora,
  layers,
  projection,
  onNightfall,
}: {
  scene: EarthScene;
  at: number;
  tour: Stop | null | undefined;
  aurora: AuroraRun | null;
  layers: ReactNode;
  projection: { map: boolean; setMap: (map: boolean) => void };
  onNightfall?: ((anchor?: { lon: number; lat: number }) => void) | undefined;
}): JSX.Element {
  const time = new Date(at).toISOString();
  const mode = tour !== undefined ? "tour" : aurora ? "aurora" : scene;
  const sceneName =
    mode === "tour"
      ? "Guided view"
      : mode === "aurora"
        ? "Aurora overflight"
        : OBSERVATORY_SCENES.find((item) => item.id === mode)!.name;
  const label =
    mode === "aurora"
      ? "NOAA forecast"
      : mode === "depth"
        ? "Depth guides"
        : mode === "night"
          ? "Catalogue sky"
          : mode === "tour"
            ? "Viewpoint"
            : "Sun overhead";
  const value = aurora
    ? `${aurora.route.focus.probability}% model chance`
    : mode === "depth"
      ? `${CUTAWAY_GUIDES_KM.slice(1).join(" / ")} km`
      : mode === "night"
        ? time.slice(0, 10)
        : mode === "tour"
          ? tour
            ? geographicCoordinates(tour)
            : "In transit"
          : geographicCoordinates(subsolarPoint(at));
  return (
    <div className="observatory-stage" data-stage={mode} role="group" aria-label="Globe readout">
      {mode === "live" ? (
        <span
          className="scene-cue scene-dayline-label"
          data-dayline-label=""
          data-nightfall={onNightfall ? "" : undefined}
        >
          {onNightfall ? (
            <button
              id="follow-nightfall"
              className="scene-cue-label"
              type="button"
              onClick={({ currentTarget }) => {
                const cue = currentTarget.parentElement;
                const point = cue?.dataset["position"]?.split(",").map(Number);
                requestAnimationFrame(() =>
                  onNightfall(point ? { lon: point[0]!, lat: point[1]! } : undefined),
                );
              }}
            >
              Follow nightfall
              <span className="sr-only" aria-hidden="true">
                Day–night boundary
              </span>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                <path d="M4 12l8-8M5 4h7v7" stroke="currentColor" stroke-width="1.3" />
              </svg>
            </button>
          ) : (
            <span className="scene-cue-label">Day–night boundary</span>
          )}
        </span>
      ) : (
        <div key={mode} className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          <span>{sceneName}</span>
        </div>
      )}
      {aurora && (
        <span
          className="sky-reference-marker"
          data-observation-anchor=""
          data-lon={aurora.route.focus.lon}
          data-lat={aurora.route.focus.lat}
        >
          {geographicCoordinates(aurora.route.focus)}
        </span>
      )}
      {aurora && <StoryProjection map={projection.map} onMap={projection.setMap} label="Aurora projection" />}
      <div key={`readout-${mode}`} className="stage-readout">
        {layers}
        <div>
          <span>{label}</span> <strong>{value}</strong>
        </div>
        <time dateTime={time}>
          {mode === "aurora" ? "Valid for " : ""}
          {time.slice(11, 16)} UTC
        </time>
      </div>
    </div>
  );
}

export function ObservatoryScenePicker({
  scene,
  ready,
  deepAvailable,
  onScene,
}: {
  scene: EarthScene;
  ready: boolean;
  deepAvailable: boolean;
  onScene: (scene: EarthScene) => void;
}): JSX.Element {
  return (
    <div
      id="observatory-scenes"
      tabIndex={-1}
      className="observatory-scenes"
      role="group"
      aria-label="Earth scenes"
    >
      {OBSERVATORY_SCENES.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => {
            if (scene !== option.id) reportAnalytics({ name: "scene_selected", scene: option.id });
            onScene(option.id);
          }}
          aria-pressed={scene === option.id}
          aria-label={option.name}
          disabled={!ready}
          aria-describedby={
            option.id === "depth" && scene === "depth" && ready && !deepAvailable
              ? "depth-availability"
              : undefined
          }
        >
          <SceneDiagram scene={option.id} />
          <span className="scene-label">{option.name}</span>
        </button>
      ))}
    </div>
  );
}

export function SunCredits(): JSX.Element {
  return (
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
  );
}
