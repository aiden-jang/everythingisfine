import { useEffect, useId, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import { drawLava, type LavaImages } from "./drawLava";
import reliefUrl from "./relief.webp?url";
import footageUrl from "./ocean-entry.webp?url";
import {
  COAST_COMPARISON,
  FLIGHT_DURATION,
  LAST,
  OCEAN_ENTRY,
  SURVEY_DURATION,
  SURVEY_STEP,
  bayCamera,
  lavaFrame,
  mapDate,
  snapshots,
  surveyCamera,
  ventCamera,
  type Camera,
} from "./lavaTimeline";

const MOTION = "(prefers-reduced-motion: reduce)";

interface Playback {
  elapsed: number;
  playing: boolean;
  camera?: Camera;
  comparison?: number;
}

const inspect = (index: number, camera = surveyCamera): Playback => ({
  elapsed: index * SURVEY_STEP,
  playing: false,
  camera,
});
const flight = (): Playback => ({ elapsed: 0, playing: true });
const comparison = (): Playback => ({ ...inspect(LAST, bayCamera), comparison: COAST_COMPARISON });

function story(index: number) {
  if (index < 2) return ["Fissure 8 reopens", "Lava from Fissure 8 spreads in Leilani Estates."];
  if (index < OCEAN_ENTRY)
    return ["Across lower Puna", "The channel extends down the East Rift Zone toward Kapoho Bay."];
  if (index === OCEAN_ENTRY)
    return [
      "Lava reaches Kapoho Bay",
      "Lava entered the ocean late on June 3. This map shows the next day’s extent.",
    ];
  if (index < LAST)
    return [
      "The lava delta grows",
      "Successive maps trace lava filling the bay and extending the shoreline.",
    ];
  return [
    "A new shoreline",
    "The dashed line marks the former coast. Amber shows land added by the Fissure 8 flow.",
  ];
}

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

export function KilaueaStage(): JSX.Element {
  const id = useId();
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");
  const [hasFootage, setHasFootage] = useState(false);
  const [view, setView] = useState<Playback>(() => (matchMedia(MOTION).matches ? inspect(0) : flight()));
  const clock = useRef(view);
  const canvas = useRef<HTMLCanvasElement>(null);
  const repaint = useRef(() => {});

  function update(next: Playback) {
    clock.current = next;
    repaint.current();
    setView(next);
  }

  useEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d");
    let closed = false;
    let width = 0;
    let height = 0;
    let images: LavaImages = { relief: null, flight: null };
    repaint.current = () => {
      if (!ctx || width <= 0 || height <= 0) return;
      const { elapsed, camera, comparison: split } = clock.current;
      drawLava(ctx, width, height, lavaFrame(elapsed, camera), images, split ?? null);
    };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry || !ctx) return;
      ({ width, height } = entry.contentRect);
      const dpr = Math.min(2, devicePixelRatio);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      repaint.current();
    });
    resize.observe(element);
    const footage = matchMedia(MOTION).matches ? Promise.resolve(null) : loadImage(footageUrl);
    void Promise.all([loadImage(reliefUrl), footage]).then(([relief, flightImage]) => {
      if (closed) return;
      images = { relief, flight: flightImage };
      repaint.current();
      setHasFootage(flightImage !== null);
      setImageState(relief ? "ready" : "error");
    });
    return () => {
      closed = true;
      resize.disconnect();
      repaint.current = () => {};
    };
  }, []);

  useEffect(() => {
    if (!view.playing || imageState === "loading") return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed =
        current.elapsed + (previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000);
      previous = now;
      if (elapsed >= (current.camera ? SURVEY_DURATION : FLIGHT_DURATION)) {
        update(comparison());
        return;
      }
      const next = { ...current, elapsed };
      clock.current = next;
      repaint.current();
      if (now - lastReadout >= 80) {
        lastReadout = now;
        setView(next);
      }
      request = requestAnimationFrame(tick);
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
  }, [imageState, view.playing]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      const current = clock.current;
      if (event.matches && !current.camera) update(inspect(lavaFrame(current.elapsed).index));
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  const frame = lavaFrame(view.elapsed, view.camera);
  const split = view.comparison ?? frame.wipe;
  const comparing = view.comparison !== undefined;
  const showingFootage = hasFootage && (frame.footage?.opacity ?? 0) > 0.5;
  const readyToReplay = comparing || (view.camera !== undefined && frame.index === LAST);
  const [title, note] = story(frame.index);
  const at = snapshots[frame.index]!.at;
  const value = view.comparison ?? frame.index;
  const amount =
    value === 0 ? "Before the eruption" : value === 100 ? "August 9 map" : `${value}% August 9 map`;

  function togglePlay() {
    const current = clock.current;
    if (current.playing) {
      update({ ...current, playing: false });
    } else if (readyToReplay) {
      update(matchMedia(MOTION).matches ? { ...inspect(0), playing: true } : flight());
    } else {
      const camera = current.camera ? { camera: surveyCamera } : {};
      update({ ...current, ...camera, playing: true });
    }
  }

  return (
    <>
      <figure className="archive-scene-map lava-map">
        <canvas
          ref={canvas}
          role="img"
          aria-label="USGS lava flow maps from Fissure 8 to Kapoho Bay and the former shoreline"
        />
        <figcaption>
          {split === null ? (
            <span>
              {imageState === "loading"
                ? "Preparing shaded relief…"
                : showingFootage
                  ? "USGS overflight · June 4, 2018"
                  : "Lower East Rift Zone"}
            </span>
          ) : (
            <>
              <span hidden={split >= 100}>Before eruption</span>
              <span hidden={split <= 0}>August 9, 2018</span>
            </>
          )}
        </figcaption>
      </figure>
      <div className="archive-scene-console lava-console">
        <div className="archive-scene-caption lava-reading">
          <h3>{title}</h3>
          <p>{note}</p>
          {imageState === "error" && (
            <p role="status">Shaded relief is unavailable. The mapped outlines are visible.</p>
          )}
          <div className="archive-scene-legend lava-legend">
            {split !== null || frame.index === LAST ? (
              <>
                <span>
                  <i className="lava-old-shore" data-ramp="" aria-hidden="true" /> Former shore
                </span>
                <span>
                  <i className="lava-delta" data-ramp="" aria-hidden="true" /> New land
                </span>
                <span>USGS estimate · ~3.5 km² added</span>
              </>
            ) : (
              <>
                <span>
                  <i className="lava-fresh" data-ramp="" aria-hidden="true" /> Newly mapped
                </span>
                <span>
                  <i className="lava-older" data-ramp="" aria-hidden="true" /> Earlier flows
                </span>
              </>
            )}
          </div>
        </div>
        <div className="lava-transport">
          <div className="lava-time">
            <label htmlFor={id}>{comparing ? "Coastline comparison" : "Mapped extent"}</label>
            {comparing ? <span>{amount}</span> : <time dateTime={at}>{mapDate(at)}</time>}
          </div>
          <input
            id={id}
            className="scrub-slider lava-scrub"
            type="range"
            min={0}
            max={comparing ? 100 : LAST}
            value={value}
            aria-valuetext={comparing ? amount : mapDate(at)}
            onInput={(event) => {
              const selected = Number(event.currentTarget.value);
              update(comparing ? { ...comparison(), comparison: selected } : inspect(selected));
            }}
          />
          <div className="archive-scene-controls lava-controls">
            <button type="button" className="archive-scene-button" onClick={togglePlay}>
              {view.playing ? "Pause" : readyToReplay ? "Replay" : "Play"}
            </button>
            <button
              type="button"
              className="archive-scene-button"
              onClick={() => update(inspect(0, ventCamera))}
            >
              Fissure 8
            </button>
            <button
              type="button"
              className="archive-scene-button"
              onClick={() => update(inspect(OCEAN_ENTRY, bayCamera))}
            >
              Ocean entry
            </button>
            <button
              type="button"
              className="archive-scene-button"
              aria-pressed={comparing}
              onClick={() => update(comparing ? inspect(LAST) : comparison())}
            >
              Compare coast
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
