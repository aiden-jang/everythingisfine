import { useEffect, useId, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import approachUrl from "./approach.webp?url";
import breakupUrl from "./breakup.webp?url";
import fragmentsUrl from "./fragments.webp?url";
import { drawDrift, type Images } from "./drawDrift";
import {
  areas,
  BREAKUP,
  dateIso,
  dateLabel,
  driftFrame,
  END,
  FIRST_FRAGMENT,
  FLIGHT_MS,
  latestIndex,
  nameOf,
  SURVEY_MS,
  tracks,
  type Photo,
} from "./icebergTimeline";

const MOTION = "(prefers-reduced-motion: reduce)";
const photos = [
  { id: "approach", url: approachUrl, caption: "Terra MODIS · Nov 5, 2020" },
  { id: "breakup", url: breakupUrl, caption: "Landsat 8 · Dec 23, 2020 · False color" },
  { id: "fragments", url: fragmentsUrl, caption: "NOAA-20 VIIRS · Jan 11, 2021" },
] as const;

interface Playback {
  elapsed: number;
  playing: boolean;
  survey: boolean;
  selected: string;
  still?: Photo | undefined;
}

const inspect = (day: number, selected = "all", still?: Photo): Playback => ({
  elapsed: (day / END) * SURVEY_MS,
  playing: false,
  survey: true,
  selected,
  still,
});
const flight = (): Playback => ({ elapsed: 0, playing: true, survey: false, selected: "all" });

function story(day: number) {
  if (day < FIRST_FRAGMENT)
    return ["Toward South Georgia", "A-68A drifts northeast across the Scotia Sea toward South Georgia."];
  if (day <= BREAKUP)
    return [
      "The breakup begins",
      "The first tracked fragments appear as A-68A turns around South Georgia’s southern shelf.",
    ];
  if (day < END)
    return [
      "The pieces drift apart",
      "The parent and its fragments drift along separate paths around South Georgia.",
    ];
  return [
    "Where the pieces went",
    "Explore the last listed positions of A-68A and its 13 tracked descendants.",
  ];
}

function coordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(2)}°${value < 0 ? negative : positive}`;
}

function trackReadout(selected: string, day: number) {
  const track = tracks.find(({ id }) => id === selected);
  if (!track) return null;
  const index = latestIndex(track.fixes, day);
  const fix = track.fixes[index];
  if (!fix) return "This track starts " + dateLabel(track.fixes[0]![0]) + ".";
  const [stamp, lon, lat] = fix;
  const label = index === track.fixes.length - 1 || stamp !== day ? "Last listed" : "Daily fix";
  return `${label} · ${dateLabel(stamp)} · ${coordinate(lat, "N", "S")} ${coordinate(lon, "E", "W")}`;
}

export function IcebergStage(): JSX.Element {
  const id = useId();
  const [available, setAvailable] = useState<Photo[] | null>(null);
  const [view, setView] = useState<Playback>(() =>
    matchMedia(MOTION).matches ? inspect(0, "all", "approach") : flight(),
  );
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
    const images: Images = {};
    let closed = false;
    let width = 0;
    let height = 0;
    repaint.current = () => {
      if (!ctx || width <= 0 || height <= 0) return;
      const { elapsed, survey, still, selected } = clock.current;
      drawDrift(ctx, width, height, driftFrame(elapsed, survey, still), images, selected);
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

    void Promise.allSettled(
      photos.map(async ({ id, url }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!closed) {
          images[id] = image;
          repaint.current();
        }
      }),
    ).then(() => {
      if (!closed) setAvailable(photos.filter(({ id }) => images[id]).map(({ id }) => id));
    });
    return () => {
      closed = true;
      resize.disconnect();
      repaint.current = () => {};
    };
  }, []);

  const loading = available === null;
  useEffect(() => {
    if (!view.playing || loading) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed =
        current.elapsed + (previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000);
      previous = now;
      if (elapsed >= (current.survey ? SURVEY_MS : FLIGHT_MS)) {
        update(inspect(END, current.selected));
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
  }, [loading, view.playing]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      const current = clock.current;
      if (event.matches && current.playing) {
        const frame = driftFrame(current.elapsed, current.survey);
        update(inspect(Math.floor(frame.day), current.selected));
      }
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  const frame = driftFrame(view.elapsed, view.survey, view.still);
  const day = Math.floor(frame.day);
  const atEnd = day === END;
  const [title, note] = story(day);
  const image =
    frame.photo && frame.photo.opacity > 0.5 && available?.includes(frame.photo.id)
      ? photos.find(({ id }) => id === frame.photo?.id)
      : undefined;
  const readout = trackReadout(view.selected, day);
  const area =
    view.selected === "all" || view.selected === "A"
      ? areas.find((sample) => sample.day === day)?.area
      : undefined;

  function togglePlay() {
    const current = clock.current;
    if (current.playing) {
      update({ ...current, playing: false });
    } else if (atEnd) {
      update(matchMedia(MOTION).matches ? { ...inspect(0), playing: true } : flight());
    } else {
      update({ ...current, still: undefined, playing: true });
    }
  }

  return (
    <>
      <figure className="archive-scene-map drift-map">
        <canvas
          ref={canvas}
          role="img"
          aria-label={image ? image.caption : "Map of A-68A and its tracked fragments near South Georgia"}
        />
        <figcaption>
          <span>
            {loading ? "Preparing satellite images…" : (image?.caption ?? "Scotia Sea · Satellite tracks")}
          </span>
        </figcaption>
      </figure>
      <div className="archive-scene-console drift-console">
        <div className="archive-scene-caption drift-reading">
          <h3>{title}</h3>
          <p>{note}</p>
          {available && available.length < photos.length && (
            <p role="status">Some satellite images are unavailable. The tracks are still available.</p>
          )}
          <div className="archive-scene-legend drift-legend">
            <span>
              <i className="drift-fix" aria-hidden="true" /> Daily position
            </span>
            <span>
              <i className="drift-last" aria-hidden="true" /> Last known position
            </span>
            {area !== undefined && (
              <span>A-68A · {Math.round(area).toLocaleString("en-US")} km² (radar)</span>
            )}
          </div>
          <div className="drift-track">
            <label htmlFor={id + "-track"}>Iceberg</label>
            <select
              id={id + "-track"}
              value={view.selected}
              onChange={(event) => {
                const selected = event.currentTarget.value;
                const track = tracks.find(({ id }) => id === selected);
                update(inspect(track?.fixes.at(-1)?.[0] ?? day, selected));
              }}
            >
              <option value="all">All icebergs</option>
              {tracks.map(({ id }) => (
                <option value={id} key={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
            {readout && <p className="drift-readout">{readout}</p>}
          </div>
        </div>
        <div className="drift-transport">
          <div className="drift-time">
            <label htmlFor={id}>Track date</label>
            <time dateTime={dateIso(day)}>{dateLabel(day)}</time>
          </div>
          <input
            id={id}
            className="scrub-slider drift-scrub"
            type="range"
            min={0}
            max={END}
            value={day}
            aria-valuetext={dateLabel(day)}
            onChange={(event) => update(inspect(event.currentTarget.valueAsNumber, view.selected))}
          />
          <div className="archive-scene-controls drift-controls">
            <button type="button" className="archive-scene-button" onClick={togglePlay}>
              {view.playing ? "Pause" : atEnd ? "Replay" : "Play"}
            </button>
            <button
              type="button"
              className="archive-scene-button"
              onClick={() => update(inspect(0, "all", "approach"))}
            >
              Approach
            </button>
            <button
              type="button"
              className="archive-scene-button"
              onClick={() => update(inspect(BREAKUP, "all", "breakup"))}
            >
              Breakup
            </button>
            <button type="button" className="archive-scene-button" onClick={() => update(inspect(END))}>
              Fragments
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
