import { geographicCoordinates } from "../globe/orbitReadout";
import { CUTAWAY_GUIDES_KM } from "../globe/cutawayScale";
import { subsolarPoint } from "../geo/sun";
import type { EarthScene } from "./useObservatory";
import type { Stop } from "./tour";
import type { AuroraRun } from "../sources/auroraRoute";

const OBSERVATORY_SCENES = [
  { id: "live", name: "Live Earth", note: "Seismicity and daylight" },
  { id: "depth", name: "Below the Surface", note: "Recorded depths" },
  { id: "night", name: "After Dark", note: "Stars and aurora" },
] as const;

function SceneDiagram({ scene }: { scene: EarthScene }): JSX.Element {
  return (
    <svg
      viewBox="0 0 32 24"
      className="scene-symbol"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      {scene === "live" ? (
        <>
          <circle cx="16" cy="12" r="9" />
          <ellipse cx="16" cy="12" rx="4.5" ry="9" />
          <path d="M7 12h18M9.2 7.5c4.5 2 9.1 2 13.6 0M9.2 16.5c4.5-2 9.1-2 13.6 0" />
          <path d="M16 3v18" className="scene-diagram-trace" pathLength="1" />
        </>
      ) : scene === "depth" ? (
        <>
          <ellipse cx="16" cy="6" rx="10" ry="3" />
          <path d="M7 10.5c1.5 2 16.5 2 18 0M9 15c1.5 2 12.5 2 14 0M11 19c1 2 9 2 10 0" />
          <path d="M16 6v14" className="scene-diagram-trace" pathLength="1" />
        </>
      ) : (
        <>
          <path d="M4 21c6-7 18-7 24 0M7 9l6-5 6 5 6-4" />
          <path d="M7 9l6-5 6 5 6-4" className="scene-diagram-trace" pathLength="1" />
          <circle cx="7" cy="9" r="1.3" fill="currentColor" />
          <circle cx="13" cy="4" r="1.3" fill="currentColor" />
          <circle cx="19" cy="9" r="1.3" fill="currentColor" />
          <circle cx="25" cy="5" r="1.3" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function ObservatoryStage({
  scene,
  at,
  tour,
  aurora,
}: {
  scene: EarthScene;
  at: number;
  tour: Stop | null | undefined;
  aurora: AuroraRun | null;
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
  );
}

export function ObservatoryFeatured({
  scene,
  ready,
  radar,
  dive,
  deep,
}: {
  scene: Exclude<EarthScene, "night">;
  ready: boolean;
  radar: () => void;
  dive: () => void;
  deep: () => void;
}): JSX.Element {
  return (
    <div className="observatory-actions" aria-label="Featured views" role="group">
      {scene === "live" ? (
        <>
          <button type="button" id="open-storm-radar" onClick={radar} disabled={!ready}>
            Storm Radar
          </button>
          <button type="button" id="open-float-dive" onClick={dive} disabled={!ready}>
            Float Dive
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
