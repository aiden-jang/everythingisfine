import { useEffect, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import { drawStorm } from "./drawStorm";
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

export function StormStage(): JSX.Element {
  const [view, setView] = useState<Playback>(() =>
    matchMedia(MOTION).matches ? seekTo(TRACK_MINUTES) : { elapsed: 0, survey: false, playing: true },
  );
  const clock = useRef(view);
  const canvas = useRef<HTMLCanvasElement>(null);
  const paint = useRef(() => {});

  function update(next: Playback) {
    clock.current = next;
    paint.current();
    setView(next);
  }

  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext("2d");
    if (!context) return;
    let width = 0;
    let height = 0;
    paint.current = () => {
      if (width > 0 && height > 0) {
        const { elapsed, survey } = clock.current;
        drawStorm(context, width, height, stormFrame(elapsed, survey));
      }
    };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      ({ width, height } = entry.contentRect);
      const dpr = Math.min(devicePixelRatio, 2);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint.current();
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      paint.current = () => {};
    };
  }, []);

  useEffect(() => {
    if (!view.playing) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const dt = previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000;
      previous = now;
      const elapsed = Math.min(duration(current), current.elapsed + dt);
      const next = { ...current, elapsed, playing: elapsed < duration(current) };
      clock.current = next;
      paint.current();
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
  }, [view.playing]);

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
  const atFix = storm.at === fix.time;

  function toggle() {
    const current = clock.current;
    if (current.playing) update({ ...current, playing: false });
    else if (current.elapsed >= duration(current)) {
      update({ elapsed: 0, playing: true, survey: matchMedia(MOTION).matches });
    } else update({ ...current, playing: true });
  }

  return (
    <>
      <figure className="archive-scene-map storm-map">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Map of Hurricane Katrina’s NOAA best track across the Gulf to Louisiana"
        />
        <figcaption>
          <span>Gulf of Mexico</span>
          <span>{view.survey || ended ? "Track overview" : "Camera follows storm center"}</span>
        </figcaption>
      </figure>
      <div className="archive-scene-console storm-console">
        <div className="archive-scene-caption storm-reading">
          <h3>{title}</h3>
          <p className="storm-measurements">
            <span>Category {stormCategory(fix.wind)}</span>
            <span>{fix.wind} kt max wind</span>
            <span>{fix.pressure} mb</span>
          </p>
          <p>
            {atFix ? "Recorded storm position" : "Most recent recorded position"}{" "}
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
            <button type="button" className="archive-scene-button" onClick={toggle}>
              {view.playing ? "Pause" : ended ? "Replay" : "Play"}
            </button>
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
    </>
  );
}
