import { reportAnalytics } from "../../analytics/browser";
import { SceneDiagram } from "./SceneDiagram";
import { geographicCoordinates } from "../globe/orbitReadout";
import { CUTAWAY_GUIDES_KM } from "../globe/cutawayScale";
import { subsolarPoint } from "../geo/sun";
import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";
import type { AuroraRun } from "../sources/auroraRoute";
import type { RadarLayerView } from "./radar/radarCamera";
import { RadarCanvasCredit } from "./CanvasFooter";

const OBSERVATORY_SCENES = [
  { id: "live", name: "Live Earth" },
  { id: "depth", name: "Below the Surface" },
  { id: "night", name: "After Dark" },
] as const;

export function ObservatoryStage({
  scene,
  at,
  tour,
  aurora,
  radar,
}: {
  scene: EarthScene;
  at: number;
  tour: Stop | null | undefined;
  aurora: AuroraRun | null;
  radar: RadarLayerView | null;
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
      <div className="stage-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div key={mode} className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>{mode === "live" ? "Day–night boundary" : sceneName}</span>
      </div>
      <div key={`readout-${mode}`} className="stage-readout">
        <RadarCanvasCredit radar={radar} />
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
  scene: EarthScene | null;
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

export function ObservatoryFeatured({
  scene,
  ready,
  radar,
  deep,
}: {
  scene: Exclude<EarthScene, "night">;
  ready: boolean;
  radar: () => void;
  deep: () => void;
}): JSX.Element {
  return (
    <div className="observatory-actions" aria-label="Featured views" role="group">
      {scene === "live" ? (
        <>
          <button type="button" id="open-storm-radar" onClick={radar} disabled={!ready}>
            Storm Radar
          </button>
        </>
      ) : (
        <button type="button" id="open-deep-time" onClick={deep} disabled={!ready}>
          Deep Time
        </button>
      )}
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

export function TourUnavailable({ note }: { note: string }): JSX.Element {
  return (
    <p id="tour-availability" className="observatory-summary">
      {note}
    </p>
  );
}
