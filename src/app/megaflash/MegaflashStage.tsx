import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { flashGeography, flashLens, flashTarget } from "./flashGlobe";
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

import { useStorySession } from "../observations/StorySession";

const MOTION = "(prefers-reduced-motion: reduce)";

interface Playback {
  elapsed: number;
  playing: boolean;
  fixed: boolean;
}

const inspect = (at: number): Playback => ({ elapsed: elapsedFor(at), playing: false, fixed: true });
const flight = (): Playback => ({ elapsed: 0, playing: true, fixed: false });

export function MegaflashStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial } = useStorySession();
  const id = useId();
  const [view, setView] = useState<Playback>(() =>
    initial
      ? inspect(
          Math.max(
            0,
            Math.min(
              DURATION,
              (initial.at ?? Date.parse("2017-10-22T08:56:45.834Z")) - Date.parse("2017-10-22T08:56:45.834Z"),
            ),
          ),
        )
      : matchMedia(MOTION).matches
        ? inspect(DURATION)
        : flight(),
  );
  const [image, setImage] = useState<HTMLImageElement | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);
  const clock = useRef(view);

  function update(next: Playback) {
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
        update(inspect(DURATION));
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
        update(inspect(flashFrame(current.elapsed, current.fixed).at));
      }
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  useLayoutEffect(() => {
    onView({
      kind: "observation",
      ...flashGeography(flashFrame(view.elapsed, view.fixed), !view.fixed || view.playing),
      image: image ?? null,
      target: flashTarget,
      lens: flashLens,
      arrive,
    });
  }, [view, image, arrive, onView]);
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
    <ReplayPanel
      {...panel}
      title="Megaflash"
      location="Southern Plains · United States"
      subtitle="GOES-16 lightning detections · 22 Oct 2017 · 08:56 UTC"
      status={scanCaption}
      at={complete ? <strong>829 ± 8 km</strong> : <span>{label}</span>}
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
        <div className="archive-scene-caption">
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
          <div className="archive-scene-controls">
            <button
              data-playback-start={!view.playing || undefined}
              type="button"
              className="archive-scene-button"
              onClick={togglePlay}
            >
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
    </ReplayPanel>
  );
}
