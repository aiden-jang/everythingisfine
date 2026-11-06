import { useEffect, useId, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import { drawFlash } from "./drawFlash";
import {
  DURATION,
  elapsedFor,
  FINAL_STEP,
  FLIGHT_END,
  flashFrame,
  flashTime,
  scan,
  stepAt,
  timeAtStep,
} from "./flashTimeline";
import infrared from "./infrared.webp?url";

const MOTION = "(prefers-reduced-motion: reduce)";

interface Playback {
  elapsed: number;
  playing: boolean;
  fixed: boolean;
}

const inspect = (at: number): Playback => ({ elapsed: elapsedFor(at), playing: false, fixed: true });
const flight = (): Playback => ({ elapsed: 0, playing: true, fixed: false });

export function MegaflashStage(): JSX.Element {
  const id = useId();
  const [view, setView] = useState<Playback>(() =>
    matchMedia(MOTION).matches ? inspect(DURATION) : flight(),
  );
  const [image, setImage] = useState<HTMLImageElement | null | undefined>(undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(view);
  const repaint = useRef(() => {});

  function update(next: Playback) {
    clock.current = next;
    repaint.current();
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

  useEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let width = 0;
    let height = 0;
    repaint.current = () => {
      if (width <= 0 || height <= 0) return;
      const { elapsed, fixed } = clock.current;
      drawFlash(ctx, width, height, flashFrame(elapsed, fixed), image ?? null);
    };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      ({ width, height } = entry.contentRect);
      const dpr = Math.min(2, devicePixelRatio);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      repaint.current();
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      repaint.current = () => {};
    };
  }, [image]);

  const waiting = image === undefined;
  useEffect(() => {
    if (!view.playing || waiting) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let frame = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed =
        current.elapsed + (previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000);
      previous = now;
      if (elapsed >= (current.fixed ? elapsedFor(DURATION) : FLIGHT_END)) {
        update(inspect(DURATION));
        return;
      }
      const next = { ...current, elapsed };
      clock.current = next;
      repaint.current();
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
  }, [waiting, view.playing]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      if (event.matches) {
        const current = clock.current;
        update(inspect(flashFrame(current.elapsed, current.fixed).at));
      }
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  const { at } = flashFrame(view.elapsed, view.fixed);
  const before = at < 0;
  const complete = at >= DURATION;
  const label = flashTime(at);
  const progress = before ? -1 : stepAt(at);
  const scanCaption = waiting
    ? "Preparing the infrared scan…"
    : image
      ? `GOES-16 infrared · ${scan.slice(11, 16)} UTC · False color`
      : before
        ? "Infrared image unavailable · showing the storm map"
        : "Infrared image unavailable · lightning detections shown on the map";

  function togglePlay() {
    const current = clock.current;
    if (current.playing) {
      update({ ...current, playing: false });
    } else if (matchMedia(MOTION).matches) {
      update({ ...inspect(complete ? 0 : Math.max(0, at)), playing: true });
    } else if (complete || (current.fixed && before)) {
      update(flight());
    } else {
      update({ ...current, playing: true });
    }
  }

  return (
    <>
      <figure className="archive-scene-map flash-map">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Map of the GOES-16 lightning trace across Texas, Oklahoma, Arkansas, Kansas and Missouri"
        />
        <figcaption>
          <span>{scanCaption}</span>
          {complete && <strong>829 ± 8 km</strong>}
        </figcaption>
      </figure>
      <div className="archive-scene-console flash-console">
        <div className="archive-scene-caption flash-reading">
          <h3>{before ? "Above the storm" : complete ? "Across five states" : "The flash spreads"}</h3>
          <p>
            {before
              ? image
                ? "An infrared scan shows the storm minutes before the first light."
                : "The lightning timeline starts with the first detected pulse."
              : complete
                ? "From eastern Texas to near Kansas City in 7.39 seconds."
                : "GOES-16 recorded pulses of light as the discharge spread through the storm."}
          </p>
          <div className="archive-scene-legend flash-legend">
            <span>
              <i aria-hidden="true" /> GOES-16 optical trace · Approximate timing
            </span>
          </div>
        </div>
        <div className="flash-transport">
          <div className="flash-time">
            <label htmlFor={id}>Flash elapsed time</label>
            <span>{label}</span>
          </div>
          <input
            id={id}
            className="scrub-slider flash-scrub"
            type="range"
            min={-1}
            max={FINAL_STEP}
            value={progress}
            aria-valuetext={label}
            onChange={(event) => update(inspect(timeAtStep(event.currentTarget.valueAsNumber)))}
          />
          <div className="archive-scene-controls flash-controls">
            <button type="button" className="archive-scene-button" onClick={togglePlay}>
              {view.playing ? "Pause" : complete ? "Replay" : "Play"}
            </button>
            <button
              type="button"
              className="archive-scene-button"
              onClick={() => update(inspect(timeAtStep(-1)))}
            >
              Before flash
            </button>
            <button type="button" className="archive-scene-button" onClick={() => update(inspect(DURATION))}>
              Full extent
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
