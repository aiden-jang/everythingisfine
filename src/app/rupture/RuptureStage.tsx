import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { StoryDock } from "../observations/StoryDock";
import { useObservationImage } from "../observations/useObservationData";
import {
  japan,
  ruptureFaultTarget,
  ruptureGeography,
  ruptureLens,
  ruptureShakingTarget,
  ruptureTarget,
} from "./ruptureGlobe";
import { animationDelta } from "../../globe/animation";
import { WaveStationLabels } from "./WaveStationLabels";
import { RuptureSources } from "./RuptureSources";
import type { WavePin, WaveReading } from "./RecordedWaves";
import {
  ARRIVAL_MS,
  MODEL_SECONDS,
  REVEAL_MS,
  SHAKING_MS,
  SLIP_MS,
  contours,
  faultAt,
  revealFrame,
  slipKey,
  stillFrame,
} from "./ruptureModel";

import { useStorySession } from "../observations/StorySession";

type Mode = "approach" | "fault" | "shaking" | "playing" | "paused";
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
    title: "Beneath the seafloor.",
    detail:
      "Colors show modeled slip in metres. About three minutes of modeled rupture play in five seconds.",
  },
  shaking: {
    title: "Back to the surface.",
    detail: "USGS ShakeMap estimates Modified Mercalli intensity (MMI) at each location.",
  },
};

function beatAt(ms: number): Beat {
  return ms < ARRIVAL_MS ? "approach" : ms < SHAKING_MS ? "fault" : "shaking";
}

export function RuptureStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const timeId = useId();
  const restoredClock = Math.max(
    0,
    Math.min(
      REVEAL_MS,
      initial?.chapter?.startsWith("reveal:") && Number.isFinite(Number(initial.chapter.slice(7)))
        ? Number(initial.chapter.slice(7))
        : ARRIVAL_MS +
            (Math.max(0, ((initial?.at ?? 0) - Date.parse("2011-03-11T05:46:24Z")) / 1000) / MODEL_SECONDS) *
              SLIP_MS,
    ),
  );
  const [waves, setWaves] = useState(initial?.chapter === "waves");
  const [reduced, setReduced] = useState(() => matchMedia(MOTION_QUERY).matches);
  const [inspection, setInspection] = useState(() =>
    initial?.chapter === "fault" && initial.at !== undefined
      ? Math.max(0, Math.min(MODEL_SECONDS, (initial.at - Date.parse("2011-03-11T05:46:24Z")) / 1000))
      : MODEL_SECONDS,
  );
  const [mode, setMode] = useState<Mode>(() =>
    initial
      ? initial.chapter === "fault" || initial.chapter === "shaking" || initial.chapter === "approach"
        ? initial.chapter
        : "paused"
      : matchMedia(MOTION_QUERY).matches
        ? "fault"
        : "approach",
  );
  const [clock, setClock] = useState(initial ? restoredClock : 0);
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);
  const recordedButton = useRef<HTMLButtonElement>(null);
  const [pins, setPins] = useState<WavePin[]>([]);
  const waveReading = useRef<WaveReading>();
  const waveReturn = useRef<{
    mode: Mode;
    clock: number;
    map: boolean;
    scroll: number;
    camera?: ReturnType<NonNullable<ReplayProps["readCamera"]>> | undefined;
  }>();
  const restoredCamera = useRef(waveReturn.current?.camera);
  const rememberWaves = useCallback((reading: WaveReading) => {
    waveReading.current = reading;
  }, []);
  const elapsed = useRef(clock);
  const { element: coast } = useObservationImage(japan.url);
  const running = mode === "playing" || mode === "paused";
  useStoryCompletion(mode === "shaking");
  const displayed = running ? beatAt(clock) : mode;
  const caption = captions[displayed];
  const frame = useMemo(
    () =>
      running || mode === "approach"
        ? revealFrame(mode === "approach" ? 0 : clock)
        : mode === "fault"
          ? faultAt(inspection)
          : stillFrame("shaking"),
    [running, mode, clock, inspection],
  );

  useLayoutEffect(() => {
    if (waves) return;
    onView({
      kind: "observation",
      ...ruptureGeography(frame, running && !restoredCamera.current),
      image: coast,
      target:
        restoredCamera.current ??
        (mode === "fault" ? ruptureFaultTarget : mode === "shaking" ? ruptureShakingTarget : ruptureTarget),
      lens: ruptureLens,
      arrive,
    });
    remember?.({ chapter: mode === "playing" || mode === "paused" ? `reveal:${clock}` : mode });
  }, [mode, clock, frame, running, waves, onView, arrive, coast, remember]);

  useEffect(() => {
    const media = matchMedia(MOTION_QUERY);
    function change(event: MediaQueryListEvent) {
      setReduced(event.matches);
      if (event.matches) {
        setMode((current) =>
          current === "approach" || current === "playing" || current === "paused"
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
    if (mode !== "playing" || !ready || waves) return;
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
  }, [mode, ready, waves]);

  function playback() {
    restoredCamera.current = undefined;
    if (reduced) {
      setMode("shaking");
      return;
    }
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

  function inspect(seconds: number) {
    setInspection(seconds);
    setMode("fault");
  }

  function openWaves() {
    waveReturn.current = {
      mode: mode === "playing" ? "paused" : mode,
      clock: elapsed.current,
      map: panel.map,
      scroll: document.getElementById("observatory-intro")?.scrollTop ?? 0,
      camera: panel.readCamera?.(),
    };
    setWaves(true);
    document.getElementById("observatory-intro")?.scrollTo(0, 0);
  }

  function closeWaves() {
    const previous = waveReturn.current;
    restoredCamera.current = previous?.camera;
    setMode(previous?.mode ?? "shaking");
    if (previous) {
      elapsed.current = previous.clock;
      setClock(previous.clock);
      panel.onMap(previous.map);
    }
    setWaves(false);
    requestAnimationFrame(() => {
      if (previous) document.getElementById("observatory-intro")?.scrollTo(0, previous.scroll);
      recordedButton.current?.focus({ preventScroll: true });
    });
  }

  return (
    <ReplayPanel
      {...panel}
      title="The Tōhoku rupture"
      location="Offshore Honshu · Japan"
      subtitle="11 Mar 2011 · 05:46:24 UTC · M9.1 · 29 km deep"
      className="rupture-journey"
      finding={false}
      save={!waves}
      status={
        waves
          ? "GSN · Recorded motion"
          : displayed === "fault"
            ? "USGS · Modeled fault movement"
            : displayed === "shaking"
              ? "USGS · Estimated surface shaking"
              : "11 March 2011"
      }
      at={<span>{!waves && frame.depth > 0 ? "Depth exaggerated 4×" : null}</span>}
      inset={<WaveStationLabels pins={waves ? pins : null} />}
      sources={<RuptureSources />}
    >
      {waves ? (
        <Suspense fallback={<p role="status">Opening recorded waves…</p>}>
          <RecordedWaves
            onView={onView}
            initialReading={waveReading.current}
            onReading={rememberWaves}
            onPins={setPins}
            reduced={reduced}
            back={closeWaves}
            backLabel={
              waveReturn.current && waveReturn.current.mode !== "shaking"
                ? "Back to rupture"
                : "Back to surface shaking"
            }
          />
        </Suspense>
      ) : (
        <div className="archive-scene-console">
          <div className="archive-scene-caption recorded-chapter">
            <h3>{caption.title}</h3>
            <p>{caption.detail}</p>
          </div>
          {mode === "approach" && (
            <button type="button" className="recorded-primary" onClick={playback}>
              Follow the rupture
            </button>
          )}
          <div className="archive-scene-actions">
            <div className="archive-scene-controls" role="group" aria-label="Rupture views">
              <button
                type="button"
                className="archive-scene-button"
                aria-label="Modeled fault movement"
                aria-pressed={mode === "fault"}
                onClick={() => inspect(MODEL_SECONDS)}
              >
                Fault movement
              </button>
              <button
                type="button"
                className="archive-scene-button"
                aria-label="Estimated surface shaking"
                aria-pressed={mode === "shaking"}
                onClick={() => {
                  restoredCamera.current = undefined;
                  setMode("shaking");
                }}
              >
                Surface shaking
              </button>
              <button ref={recordedButton} type="button" className="archive-scene-button" onClick={openWaves}>
                Recorded waves
              </button>
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
          {mode !== "approach" && (
            <StoryDock label="Tōhoku playback">
              <div className="survey-transport" data-comparing="true">
                <div className="story-dock-time">
                  <label htmlFor={timeId}>Modeled rupture time</label>
                  <span className="story-dock-readout">+{Math.round(frame.modelTime)} s</span>
                </div>
                <input
                  id={timeId}
                  className="scrub-slider"
                  type="range"
                  min={0}
                  max={Math.ceil(MODEL_SECONDS)}
                  value={
                    frame.modelTime >= MODEL_SECONDS ? Math.ceil(MODEL_SECONDS) : Math.round(frame.modelTime)
                  }
                  aria-valuetext={`+${Math.round(frame.modelTime)} seconds`}
                  onChange={(event) => inspect(event.currentTarget.valueAsNumber)}
                />
                {!reduced && (
                  <div className="story-dock-actions">
                    <PlaybackButton
                      playing={mode === "playing"}
                      ended={mode !== "playing" && mode !== "paused"}
                      onClick={playback}
                    />
                  </div>
                )}
              </div>
            </StoryDock>
          )}
        </div>
      )}
    </ReplayPanel>
  );
}
