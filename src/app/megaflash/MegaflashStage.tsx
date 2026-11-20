import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { StoryDock } from "../observations/StoryDock";
import { flashGeography, flashLens, flashStart, flashTarget } from "./flashGlobe";
import {
  DURATION,
  elapsedFor,
  FINAL_STEP,
  FLIGHT_END,
  flashFrame,
  flashTime,
  scan,
  trace,
  stepAt,
  timeAtStep,
} from "./flashTimeline";
import infrared from "./infrared.webp?url";

import { useStoryNavigation } from "../journeys/StoryNavigation";
import { useStorySession } from "../observations/StorySession";

const MOTION = "(prefers-reduced-motion: reduce)";

interface Playback {
  elapsed: number;
  playing: boolean;
  fixed: boolean;
  phase: "infrared" | "replay" | "extent" | "inspect";
}

const still = (at: number, phase: Playback["phase"]): Playback => ({
  elapsed: elapsedFor(at),
  playing: false,
  fixed: true,
  phase,
});
const infraredView = () => still(timeAtStep(-1), "infrared");
const overview = () => still(DURATION, "extent");
const fixedTarget = { ...flashTarget };
const flight = (): Playback => ({ elapsed: 0, playing: true, fixed: false, phase: "replay" });

export function MegaflashStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const navigation = useStoryNavigation();
  const id = useId();
  const [view, setView] = useState<Playback>(() => {
    if (!initial) return matchMedia(MOTION).matches ? overview() : infraredView();
    if (initial.chapter === "infrared") return infraredView();
    if (initial.chapter === "extent") return overview();
    const offset = Math.max(0, Math.min(DURATION, (initial.at ?? flashStart) - flashStart));
    const at = timeAtStep(stepAt(offset));
    return still(at, initial.chapter === "inspect" || at < DURATION ? "inspect" : "extent");
  });
  const [image, setImage] = useState<HTMLImageElement | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);
  const clock = useRef(view);
  const openedPlayback = useRef(Boolean(initial) || view.phase !== "infrared");
  const beforeInspect = useRef<{ view: Playback; map: boolean }>();
  const started = useRef<HTMLButtonElement>(null);

  function update(next: Playback) {
    if (next.phase !== "infrared") openedPlayback.current = true;
    clock.current = next;
    setView(next);
  }

  useEffect(() => {
    const image = new Image();
    image.src = infrared;
    let closed = false;
    void image.decode().then(
      () => {
        if (!closed) setImage(image);
      },
      () => {
        if (!closed) setImage(null);
      },
    );
    return () => {
      closed = true;
    };
  }, []);

  const waiting = image === undefined;
  useEffect(() => {
    if (!view.playing || waiting || !ready) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let frame = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed = current.elapsed + (previous === undefined ? 0 : now - previous);
      previous = now;
      if (elapsed >= (current.fixed ? elapsedFor(DURATION) : FLIGHT_END)) {
        update(overview());
        return;
      }
      const next = { ...current, elapsed };
      clock.current = next;
      if (now - lastReadout >= 100) {
        lastReadout = now;
        setView(next);
      }
      frame = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(frame);
      previous = undefined;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [waiting, view.playing, ready]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      if (event.matches) {
        const current = clock.current;
        const { at } = flashFrame(current.elapsed, current.fixed);
        update(at < 0 ? infraredView() : still(at, current.phase === "replay" ? "inspect" : current.phase));
      }
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  useLayoutEffect(() => {
    onView({
      kind: "observation",
      ...flashGeography(flashFrame(view.elapsed, view.fixed), view.phase, !view.fixed),
      image: image ?? null,
      target: view.fixed ? fixedTarget : flashTarget,
      lens: flashLens,
      arrive,
    });
    remember?.({ chapter: view.phase });
  }, [view, image, arrive, onView, remember]);
  const { at } = flashFrame(view.elapsed, view.fixed);
  const before = at < 0;
  const complete = at >= DURATION;
  const inspecting = view.phase === "inspect";
  const finished = view.phase === "extent" || inspecting;
  const kept =
    inspecting &&
    navigation?.library.saved.some(
      ({ position }) =>
        position.moment?.id === "megaflash" &&
        position.moment.chapter === "inspect" &&
        position.moment.at === Math.round(flashStart + at),
    );
  useStoryCompletion(finished);
  const label = flashTime(at);
  const progress = before ? -1 : stepAt(at);
  const scanCaption = before
    ? waiting
      ? "Preparing the infrared scan…"
      : image
        ? `GOES-16 infrared · ${scan.slice(11, 16)} UTC · False color`
        : "Infrared image unavailable · showing the storm map"
    : inspecting
      ? "GOES-16 optical detections · 0.25 s windows"
      : "GOES-16 optical detections";

  function togglePlay() {
    const current = clock.current;
    if (current.playing) update({ ...current, playing: false });
    else if (matchMedia(MOTION).matches) update({ ...still(0, "replay"), playing: true });
    else if (current.fixed) update(flight());
    else update({ ...current, playing: true });
  }

  function inspect(position: number) {
    const current = clock.current;
    if (current.phase !== "inspect")
      beforeInspect.current = { view: { ...current, playing: false }, map: panel.map };
    update(still(position, "inspect"));
  }

  function returnFromInspect() {
    const prior = beforeInspect.current;
    if (prior && prior.view.phase !== "infrared") {
      panel.onMap(prior.map);
      update(prior.view);
    } else update(overview());
  }

  function follow() {
    if (matchMedia(MOTION).matches) update(overview());
    else update(flight());
    requestAnimationFrame(() => started.current?.focus({ preventScroll: true }));
  }

  return (
    <ReplayPanel
      {...panel}
      title="Megaflash"
      className="megaflash-journey"
      finding={false}
      save={!inspecting}
      location="Southern Plains · United States"
      subtitle="GOES-16 lightning detections · 22 Oct 2017 · 08:56 UTC"
      status={scanCaption}
      inset={
        finished && (
          <div className="recorded-anchors" aria-hidden="true">
            <span data-observation-anchor="" data-lon={trace[0]![1]} data-lat={trace[0]![2]}>
              Eastern Texas
            </span>
            <span data-observation-anchor="" data-lon={-94.6} data-lat={39.08}>
              Near Kansas City
            </span>
          </div>
        )
      }
      at={finished ? <strong>829 ± 8 km</strong> : <span>{label}</span>}
      sources={
        <>
          <a href="https://doi.org/10.1175/BAMS-D-25-0037.1" target="_blank" rel="noreferrer">
            GLM trace · Peterson et al.
          </a>
          <a
            href="https://www.nesdis.noaa.gov/news/noaa-satellites-help-certify-worlds-longest-lightning-flash"
            target="_blank"
            rel="noreferrer"
          >
            NOAA GOES-16
          </a>
          <a
            href="https://wmo.int/news/media-centre/wmo-certifies-megaflash-lightning-record-usa"
            target="_blank"
            rel="noreferrer"
          >
            WMO certification
          </a>
        </>
      }
    >
      <div className="archive-scene-console">
        <div className="archive-scene-caption recorded-chapter">
          <h3>
            {before
              ? "Above the storm."
              : inspecting
                ? "Read the flash."
                : finished
                  ? "Seven seconds. Five states."
                  : "A flash takes shape."}
          </h3>
          <p>
            {before
              ? image
                ? "An infrared scan shows the storm minutes before the first light."
                : "The lightning timeline starts with the first detected pulse."
              : inspecting
                ? "Scrub the detections in quarter-second steps. Brighter points mark the selected window."
                : finished
                  ? "From eastern Texas to near Kansas City in 7.39 seconds."
                  : "GOES-16 recorded pulses of light as the discharge spread through the storm."}
          </p>
          <div className="archive-scene-legend flash-legend">
            <span>
              <i aria-hidden="true" /> GOES-16 optical trace · Approximate timing
            </span>
          </div>
        </div>
        {finished && (
          <p className="flash-finding">
            <strong>829 ± 8 km</strong>
            <span>WMO-certified span · 7.39 s elapsed</span>
          </p>
        )}
        <StoryDock label="Megaflash playback" deferOnShortPhone={!openedPlayback.current}>
          <div className="survey-transport" data-comparing="true">
            <div className="story-dock-time">
              <label htmlFor={id}>Flash elapsed time</label>
              <span className="story-dock-readout">{label}</span>
            </div>
            <input
              id={id}
              className="scrub-slider"
              type="range"
              min={-1}
              max={FINAL_STEP}
              value={progress}
              aria-valuetext={label}
              onChange={(event) => {
                const position = timeAtStep(event.currentTarget.valueAsNumber);
                if (position < 0) update(infraredView());
                else inspect(position);
              }}
            />
            {view.phase !== "infrared" && (
              <div className="story-dock-actions">
                <PlaybackButton
                  buttonRef={started}
                  playing={view.playing}
                  ended={finished || complete}
                  onClick={togglePlay}
                />
              </div>
            )}
          </div>
        </StoryDock>
        <div className="archive-scene-controls">
          {before && view.phase === "infrared" && (
            <button type="button" className="recorded-primary" onClick={follow}>
              Follow the flash
            </button>
          )}
          {view.phase === "extent" && (
            <button type="button" className="recorded-primary" onClick={() => inspect(DURATION)}>
              Inspect pulses
            </button>
          )}
          {inspecting && navigation && (
            <button
              type="button"
              className="recorded-primary"
              disabled={kept}
              onClick={() => {
                const visit = navigation.current();
                if (visit) navigation.library.save(visit);
              }}
            >
              {kept ? "Reading kept" : "Keep this reading"}
            </button>
          )}
          {view.phase !== "infrared" && (
            <button type="button" className="archive-scene-button" onClick={() => update(infraredView())}>
              Before flash
            </button>
          )}
          {view.phase !== "extent" && (
            <button
              type="button"
              className="archive-scene-button"
              onClick={inspecting ? returnFromInspect : () => update(overview())}
            >
              {inspecting && beforeInspect.current?.view.phase === "replay"
                ? "Back to replay"
                : "Full extent"}
            </button>
          )}
        </div>
        {inspecting && navigation?.library.notice && (
          <p className="observation-note" role="status">
            {navigation.library.notice}
          </p>
        )}
      </div>
    </ReplayPanel>
  );
}
