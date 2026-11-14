import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { gulf, stormGeography, stormLens, stormTarget } from "./stormGlobe";
import { useObservationImage } from "../observations/useObservationData";
import {
  FIXES,
  FLIGHT_MS,
  START,
  SURVEY_MS,
  TRACK_MINUTES,
  stormCategory,
  stormClock,
  stormFrame,
} from "./stormTrack";

import { useStorySession } from "../observations/StorySession";

const MOTION = "(prefers-reduced-motion: reduce)";
const PEAK_MINUTE = (FIXES.reduce((peak, fix) => (fix.wind > peak.wind ? fix : peak)).time - START) / 60_000;

interface Playback {
  elapsed: number;
  survey: boolean;
  playing: boolean;
}

function seekTo(minute: number): Playback {
  return { elapsed: (minute / TRACK_MINUTES) * SURVEY_MS, survey: true, playing: false };
}

const duration = (playback: Playback) => (playback.survey ? SURVEY_MS : FLIGHT_MS);

export function StormStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial } = useStorySession();
  const [view, setView] = useState<Playback>(() =>
    initial
      ? seekTo(Math.max(0, Math.min(TRACK_MINUTES, ((initial.at ?? START) - START) / 60000)))
      : matchMedia(MOTION).matches
        ? seekTo(TRACK_MINUTES)
        : { elapsed: 0, survey: false, playing: true },
  );
  const clock = useRef(view);
  const { element: coast } = useObservationImage(gulf.url);
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);

  function update(next: Playback) {
    clock.current = next;
    setView(next);
  }

  useEffect(() => {
    if (!view.playing || !ready) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const dt = previous === undefined ? 0 : now - previous;
      previous = now;
      const elapsed = Math.min(duration(current), current.elapsed + dt);
      const next = { ...current, elapsed, playing: elapsed < duration(current) };
      clock.current = next;
      if (!next.playing || now - lastReadout >= 75) {
        setView(next);
        lastReadout = now;
      }
      if (next.playing) request = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden) request = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [view.playing, ready]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      if (!event.matches || clock.current.survey) return;
      const at = stormFrame(clock.current.elapsed, false).storm.at;
      update(seekTo((at - START) / 60_000));
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  useLayoutEffect(() => {
    const frame = stormFrame(view.elapsed, view.survey);
    onView({
      kind: "observation",
      ...stormGeography(frame, !view.survey),
      image: coast,
      target: stormTarget,
      lens: stormLens,
      arrive,
    });
  }, [view, onView, arrive, coast]);
  const storm = stormFrame(view.elapsed, view.survey).storm;
  const { fix } = storm;
  const minute = Math.floor((storm.at - START) / 60_000);
  const ended = view.elapsed >= duration(view);
  const title = fix.landfall
    ? "Landfall near Buras, Louisiana"
    : fix.wind === 150
      ? "Peak offshore intensity"
      : "Across the Gulf";
  const progress = stormClock(storm.at);
  useStoryCompletion(ended && !view.playing);
  const atFix = storm.at === fix.time;

  function toggle() {
    const current = clock.current;
    if (current.playing) update({ ...current, playing: false });
    else if (current.elapsed >= duration(current)) {
      update({ elapsed: 0, playing: true, survey: matchMedia(MOTION).matches });
    } else update({ ...current, playing: true });
  }

  return (
    <ReplayPanel
      {...panel}
      title="Eye of the Storm"
      location="Gulf of Mexico"
      subtitle="Hurricane Katrina · NOAA best track · 28–29 Aug 2005"
      status={view.survey || ended ? "Track overview" : "Camera follows storm center"}
      at={<time dateTime={new Date(storm.at).toISOString()}>{progress}</time>}
      sources={
        <>
          <a href="https://www.nhc.noaa.gov/data/" target="_blank" rel="noreferrer">
            NOAA HURDAT2
          </a>
          <a href="https://www.nhc.noaa.gov/data/tcr/AL122005_Katrina.pdf" target="_blank" rel="noreferrer">
            NHC Katrina report
          </a>
          <span>Coastlines by Natural Earth</span>
        </>
      }
    >
      <div className="archive-scene-console">
        <div className="archive-scene-caption storm-reading">
          <h3>{title}</h3>
          <p className="storm-measurements">
            <span>Category {stormCategory(fix.wind)}</span>
            <span>{fix.wind} kt max wind</span>
            <span>{fix.pressure} mb</span>
          </p>
          <p>
            {atFix ? "Recorded position" : "Last recorded position"}{" "}
            <time dateTime={fix.at}>{stormClock(fix.time)}</time>
          </p>
        </div>
        <div className="storm-transport">
          <div className="storm-timeline">
            <label htmlFor="storm-time">Track time</label>
            <time dateTime={new Date(storm.at).toISOString()}>{progress}</time>
          </div>
          <input
            id="storm-time"
            className="scrub-slider storm-scrub"
            type="range"
            min={0}
            max={TRACK_MINUTES}
            value={minute}
            aria-valuetext={progress}
            onInput={(event) => update(seekTo(Number(event.currentTarget.value)))}
          />
          <div className="archive-scene-controls">
            <PlaybackButton
              playing={view.playing}
              ended={ended}
              className="archive-scene-button"
              onClick={toggle}
            />
            <button
              type="button"
              className="archive-scene-button"
              aria-label="Offshore peak"
              onClick={() => update(seekTo(PEAK_MINUTE))}
            >
              Peak
            </button>
            <button
              type="button"
              className="archive-scene-button"
              onClick={() => update(seekTo(TRACK_MINUTES))}
            >
              Landfall
            </button>
          </div>
          <p className="storm-legend">
            {fix.landfall ? (
              "Wind extent unavailable for this position."
            ) : (
              <>
                <span>
                  <i className="storm-extent" aria-hidden="true" />
                  34 kt radius
                </span>
                <span>
                  <i className="storm-extent storm-extent-strong" aria-hidden="true" />
                  64 kt radius
                </span>
                <span>Center and radii interpolated.</span>
              </>
            )}
          </p>
        </div>
      </div>
    </ReplayPanel>
  );
}
