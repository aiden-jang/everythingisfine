import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useObservationImage } from "../observations/useObservationData";
import { ReplayInset } from "../observations/ReplayInset";
import { japan, ruptureGeography, ruptureLens, ruptureTarget } from "./ruptureGlobe";
import { animationDelta } from "../../globe/animation";
import { drawRupture } from "./drawRupture";
import {
  ARRIVAL_MS,
  MODEL_SECONDS,
  REVEAL_MS,
  SHAKING_MS,
  contours,
  revealFrame,
  slipKey,
  stillFrame,
} from "./ruptureModel";

import { useStorySession } from "../observations/StorySession";

type Mode = "fault" | "shaking" | "playing" | "paused";
type Beat = "approach" | "fault" | "shaking";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const RecordedWaves = lazy(() =>
  import("./RecordedWaves").then(({ RecordedWaves }) => ({ default: RecordedWaves })),
);
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

export function RuptureStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const restoredClock = Math.max(
    0,
    Math.min(
      REVEAL_MS,
      initial?.chapter?.startsWith("reveal:") && Number.isFinite(Number(initial.chapter.slice(7)))
        ? Number(initial.chapter.slice(7))
        : ARRIVAL_MS +
            (Math.max(0, ((initial?.at ?? 0) - Date.parse("2011-03-11T05:46:24Z")) / 1000) / MODEL_SECONDS) *
              5000,
    ),
  );
  const [waves, setWaves] = useState(initial?.chapter === "waves");
  const [reduced, setReduced] = useState(() => matchMedia(MOTION_QUERY).matches);
  const [mode, setMode] = useState<Mode>(() =>
    initial
      ? initial.chapter === "fault" || initial.chapter === "shaking"
        ? initial.chapter
        : "paused"
      : matchMedia(MOTION_QUERY).matches
        ? "fault"
        : "playing",
  );
  const [clock, setClock] = useState(initial ? restoredClock : 0);
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);
  const recordedButton = useRef<HTMLButtonElement>(null);
  const elapsed = useRef(clock);
  const { element: coast } = useObservationImage(japan.url);
  const running = mode === "playing" || mode === "paused";
  useStoryCompletion(mode === "shaking");
  const displayed = running ? beatAt(clock) : mode;
  const caption = captions[displayed];
  const frame = running ? revealFrame(clock) : stillFrame(mode);

  useLayoutEffect(() => {
    if (waves) return;
    const current = mode === "playing" || mode === "paused" ? revealFrame(clock) : stillFrame(mode);
    onView({
      kind: "observation",
      ...ruptureGeography(current),
      image: coast,
      target: ruptureTarget,
      lens: ruptureLens,
      arrive,
    });
    remember?.({ chapter: mode === "playing" || mode === "paused" ? `reveal:${clock}` : mode });
  }, [mode, clock, waves, onView, arrive, coast, remember]);

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
    if (mode !== "playing" || !ready) return;
    let previous: number | undefined;
    let request = 0;
    let lastReadout = 0;
    function step(now: number) {
      if (previous !== undefined)
        elapsed.current = Math.min(
          REVEAL_MS,
          elapsed.current + animationDelta((now - previous) / 1000) * 1000,
        );
      previous = now;
      if (elapsed.current >= REVEAL_MS) setMode("shaking");
      else {
        if (now - lastReadout >= 80) {
          lastReadout = now;
          setClock(elapsed.current);
        }
        request = requestAnimationFrame(step);
      }
    }
    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden) request = requestAnimationFrame(step);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [mode, ready]);

  function playback() {
    if (mode === "playing") {
      setClock(elapsed.current);
      return setMode("paused");
    }
    if (mode !== "paused") {
      elapsed.current = 0;
      setClock(0);
    }
    setMode("playing");
  }

  return (
    <ReplayPanel
      {...panel}
      title="The Tōhoku rupture"
      location="Offshore Honshu · Japan"
      subtitle="11 Mar 2011 · 05:46:24 UTC · M9.1 · 29 km deep"
      status={waves ? "Global Seismographic Network · Recorded motion" : caption.title}
      at={<span>{!waves && displayed === "fault" ? "Depth exaggerated 4×" : "38.297° N / 142.373° E"}</span>}
      inset={
        !waves &&
        frame.depth > 0 && (
          <ReplayInset
            label="USGS fault cutaway, depth exaggerated four times"
            width={720}
            height={510}
            opacity={frame.depth}
            detail
            paint={(context) => drawRupture(context, 720, 510, frame)}
          />
        )
      }
      sources={
        <>
          <a
            href="https://earthquake.usgs.gov/earthquakes/eventpage/usc0001xgp/finite-fault"
            target="_blank"
            rel="noreferrer"
          >
            USGS finite fault
          </a>
          <a
            href="https://earthquake.usgs.gov/earthquakes/eventpage/usc0001xgp/shakemap"
            target="_blank"
            rel="noreferrer"
          >
            USGS ShakeMap
          </a>
          <span>Coastlines by Natural Earth</span>
        </>
      }
    >
      {waves ? (
        <Suspense fallback={<p role="status">Opening recorded waves…</p>}>
          <RecordedWaves
            onView={onView}
            back={() => {
              setWaves(false);
              requestAnimationFrame(() => recordedButton.current?.focus({ preventScroll: true }));
            }}
          />
        </Suspense>
      ) : (
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
              <button
                ref={recordedButton}
                type="button"
                className="archive-scene-button"
                onClick={() => {
                  setMode("shaking");
                  setWaves(true);
                }}
              >
                Recorded waves
              </button>
              {!reduced && (
                <PlaybackButton
                  playing={mode === "playing"}
                  ended={mode !== "playing" && mode !== "paused"}
                  className="archive-scene-button"
                  onClick={playback}
                />
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
      )}
    </ReplayPanel>
  );
}
