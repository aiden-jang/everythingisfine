import type { EarthScene } from "./useObservatory";

export function SceneDiagram({ scene }: { scene: EarthScene }): JSX.Element {
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
