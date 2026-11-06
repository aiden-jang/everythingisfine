import { useEffect, useRef, useState } from "react";
import { drawRupture } from "./drawRupture";
import {
  ARRIVAL_MS,
  REVEAL_MS,
  SHAKING_MS,
  contours,
  revealFrame,
  slipKey,
  stillFrame,
} from "./ruptureModel";

type Mode = "fault" | "shaking" | "playing" | "paused";
type Beat = "approach" | "fault" | "shaking";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const shakingLegend = [2, 4, 6, 8].map((level, index) => ({
  label: ["II", "IV", "VI", "VIII"][index]!,
  color: contours.find(({ mmi }) => mmi === level)!.color,
}));

const captions = {
  approach: {
    title: "Off the coast of Honshu",
    detail: "The crosshair marks the epicenter. The camera tilts to reveal the fault beneath it.",
  },
  fault: {
    title: "Modeled fault movement",
    detail:
      "Colors show modeled slip in metres. About three minutes of modeled rupture play in five seconds.",
  },
  shaking: {
    title: "Estimated surface shaking",
    detail: "USGS ShakeMap estimates Modified Mercalli intensity (MMI) at each location.",
  },
};

function beatAt(ms: number): Beat {
  return ms < ARRIVAL_MS ? "approach" : ms < SHAKING_MS ? "fault" : "shaking";
}

export function RuptureStage(): JSX.Element {
  const [reduced, setReduced] = useState(() => matchMedia(MOTION_QUERY).matches);
  const [mode, setMode] = useState<Mode>(() => (matchMedia(MOTION_QUERY).matches ? "fault" : "playing"));
  const [beat, setBeat] = useState<Beat>("approach");
  const canvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const running = mode === "playing" || mode === "paused";
  const displayed = running ? beat : mode;
  const caption = captions[displayed];

  useEffect(() => {
    const media = matchMedia(MOTION_QUERY);
    function change(event: MediaQueryListEvent) {
      setReduced(event.matches);
      if (event.matches) {
        setMode((current) =>
          current === "playing" || current === "paused"
            ? beatAt(elapsed.current) === "shaking"
              ? "shaking"
              : "fault"
            : current,
        );
      }
    }
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let previous: number | undefined;
    let request = 0;
    let width = 0;
    let height = 0;
    let lastBeat = beatAt(elapsed.current);
    const animated = mode === "playing" || mode === "paused";

    function paint() {
      if (width > 0 && height > 0) {
        drawRupture(ctx!, width, height, animated ? revealFrame(elapsed.current) : stillFrame(mode));
      }
    }

    function step(now: number) {
      if (previous !== undefined) elapsed.current = Math.min(REVEAL_MS, elapsed.current + now - previous);
      previous = now;
      const next = beatAt(elapsed.current);
      if (next !== lastBeat) {
        lastBeat = next;
        setBeat(next);
      }
      paint();
      if (elapsed.current >= REVEAL_MS) setMode("shaking");
      else request = requestAnimationFrame(step);
    }

    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      ({ width, height } = entry.contentRect);
      const dpr = Math.min(devicePixelRatio, 2);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    });
    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden && mode === "playing") request = requestAnimationFrame(step);
    }
    resize.observe(element);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(request);
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [mode]);

  function playback() {
    if (mode === "playing") return setMode("paused");
    if (mode !== "paused") {
      elapsed.current = 0;
      setBeat("approach");
    }
    setMode("playing");
  }

  return (
    <>
      <figure className="archive-scene-map">
        <canvas ref={canvas} role="img" aria-label={caption.title + ". " + caption.detail} />
        <figcaption>
          <span>38.297° N / 142.373° E</span>
          <span>{displayed === "fault" ? "Depth exaggerated 4×" : "Offshore Japan"}</span>
        </figcaption>
      </figure>
      <div className="archive-scene-console">
        <div className="archive-scene-caption" role="status">
          <h3>{caption.title}</h3>
          <p>{caption.detail}</p>
        </div>
        <div className="archive-scene-actions">
          <div className="archive-scene-controls" role="group" aria-label="Rupture views">
            <button
              type="button"
              className="archive-scene-button"
              aria-label="Modeled fault movement"
              aria-pressed={mode === "fault"}
              onClick={() => setMode("fault")}
            >
              Fault movement
            </button>
            <button
              type="button"
              className="archive-scene-button"
              aria-label="Estimated surface shaking"
              aria-pressed={mode === "shaking"}
              onClick={() => setMode("shaking")}
            >
              Surface shaking
            </button>
            {!reduced && (
              <button type="button" className="archive-scene-button" onClick={playback}>
                {mode === "playing" ? "Pause reveal" : mode === "paused" ? "Resume reveal" : "Replay reveal"}
              </button>
            )}
          </div>
          {displayed === "approach" ? (
            <div className="archive-scene-legend" aria-hidden="true" />
          ) : (
            <div
              className="archive-scene-legend"
              role="group"
              aria-label={displayed === "fault" ? "Modeled slip in metres" : "Modified Mercalli intensity"}
            >
              <span>{displayed === "fault" ? "Slip · m" : "Intensity · MMI"}</span>
              {(displayed === "fault" ? slipKey : shakingLegend).map(({ label, color }) => (
                <span key={label}>
                  <i data-ramp="" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
