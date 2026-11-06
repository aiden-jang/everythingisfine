import { useEffect, useId, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import { paintTonga, type Satellite } from "./drawTonga";
import { PressureChart } from "./PressureChart";
import infraredUrl from "./infrared.webp?url";
import vaporUrl from "./water-vapor.webp?url";
import {
  ANTIPODE,
  DURATION,
  END,
  ERUPTION,
  START,
  SURVEY_DURATION,
  infrared,
  layersAt,
  latestScan,
  minuteAt,
  stationAt,
  stations,
  timeIso,
  timeLabel,
  vapor,
} from "./tongaTimeline";

const MOTION = "(prefers-reduced-motion: reduce)";
type Station = (typeof stations)[number];
type Assets = "loading" | "ready" | "partial" | "error";

interface Playback {
  elapsed: number;
  playing: boolean;
  anchor?: number;
  station?: Station;
}

function survey(minute: number, station?: Station): Playback {
  return {
    elapsed: ((minute - START) / (END - START)) * SURVEY_DURATION,
    playing: false,
    anchor: Math.max(410, minute),
    ...(station ? { station } : {}),
  };
}

const duration = (view: Playback) => (view.anchor === undefined ? DURATION : SURVEY_DURATION);
const minuteFor = (view: Playback) => minuteAt(view.elapsed, view.anchor !== undefined);
const initialFlight = () => ({ elapsed: 0, playing: true });

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

export function TongaStage(): JSX.Element {
  const id = useId();
  const [assets, setAssets] = useState<Assets>("loading");
  const [view, setView] = useState<Playback>(() =>
    matchMedia(MOTION).matches ? survey(ERUPTION) : initialFlight(),
  );
  const clock = useRef(view);
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<Satellite>({ infrared: null, vapor: null });
  const repaint = useRef(() => {});

  function update(next: Playback) {
    clock.current = next;
    repaint.current();
    setView(next);
  }

  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext("2d");
    let closed = false;
    let width = 0;
    let height = 0;
    repaint.current = () => {
      if (!context || width <= 0 || height <= 0) return;
      const current = clock.current;
      const minute = minuteFor(current);
      const station = current.station ?? stationAt(minute);
      paintTonga(context, width, height, minute, images.current, station, current.anchor);
    };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry || !context) return;
      ({ width, height } = entry.contentRect);
      const dpr = Math.min(devicePixelRatio, 2);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      repaint.current();
    });
    resize.observe(element);
    void Promise.all([loadImage(infraredUrl), loadImage(vaporUrl)]).then(([ir, wv]) => {
      if (closed) return;
      images.current = { infrared: ir, vapor: wv };
      repaint.current();
      setAssets(ir && wv ? "ready" : ir || wv ? "partial" : "error");
    });
    return () => {
      closed = true;
      resize.disconnect();
      repaint.current = () => {};
      images.current = { infrared: null, vapor: null };
    };
  }, []);

  useEffect(() => {
    if (!view.playing || assets === "loading") return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed = Math.min(
        duration(current),
        current.elapsed + (previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000),
      );
      previous = now;
      const next = { ...current, elapsed, playing: elapsed < duration(current) };
      clock.current = next;
      repaint.current();
      if (!next.playing || now - lastReadout >= 90) {
        lastReadout = now;
        setView(next);
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
  }, [view.playing, assets]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      const current = clock.current;
      if (event.matches && current.anchor === undefined) update(survey(minuteFor(current)));
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  const minute = minuteFor(view);
  const station = view.station ?? stationAt(minute);
  const ended = view.elapsed >= duration(view);
  const hasInfrared = images.current.infrared !== null;
  const hasVapor = images.current.vapor !== null;
  const { vaporMix, orbitMix } = layersAt(minute, hasInfrared, hasVapor, view.anchor !== undefined);
  const isOrbit = orbitMix >= 0.5;
  const isVapor = !isOrbit && vaporMix >= 0.5;
  const scans = isVapor ? vapor : infrared;
  const scan = scans[latestScan(scans, minute)]!;
  const hasImage = Boolean(isVapor ? images.current.vapor : images.current.infrared);
  const caption = isOrbit
    ? "Estimated atmospheric wave"
    : isVapor
      ? "GOES-17 · Water-vapor change"
      : "GOES-17 · Infrared";
  const title =
    minute >= ANTIPODE
      ? "The far side of Earth"
      : isOrbit
        ? minute >= station.start && minute < station.start + station.values.length
          ? `The pulse at ${station.name}`
          : "Across the Pacific"
        : isVapor
          ? "Ripples in the atmosphere"
          : "Over Hunga Tonga";
  const help = isOrbit
    ? "The ring estimates the first Lamb wave. The chart shows measured air pressure."
    : isVapor
      ? "Brightness-temperature change from the previous 10-minute scan."
      : "False-color infrared shows the eruption cloud expanding over the Pacific.";

  function toggle() {
    const current = clock.current;
    if (current.playing) update({ ...current, playing: false });
    else if (current.elapsed >= duration(current)) {
      update(matchMedia(MOTION).matches ? { ...survey(START), playing: true } : initialFlight());
    } else update({ ...current, playing: true });
  }

  return (
    <>
      <figure className="archive-scene-map tonga-map">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Satellite observations of the Tonga eruption and a globe showing the estimated atmospheric wave"
        />
        <figcaption>
          <span>
            {assets === "loading"
              ? "Preparing satellite scans…"
              : !isOrbit && !hasImage
                ? "Satellite imagery unavailable for this chapter"
                : caption}
          </span>
          {hasImage && !isOrbit && <time dateTime={scan.at}>Scan {timeLabel(scan.minute)} UTC</time>}
        </figcaption>
      </figure>
      <div className="archive-scene-console tonga-console">
        <div className="tonga-transport">
          <div className="archive-scene-caption tonga-caption">
            <h3>{title}</h3>
            <p>{help}</p>
            {(assets === "partial" || assets === "error") && (
              <p role="status">
                {assets === "partial"
                  ? images.current.infrared
                    ? "Water-vapor imagery unavailable. Infrared and pressure readings remain available."
                    : "Infrared imagery unavailable. Water-vapor and pressure readings remain available."
                  : "Satellite scans unavailable. The estimated wave and pressure readings remain available."}
              </p>
            )}
          </div>
          <div className="tonga-time">
            <label htmlFor={id}>Replay time</label>
            <time dateTime={timeIso(minute)}>{timeLabel(minute)} UTC</time>
          </div>
          <input
            id={id}
            className="scrub-slider tonga-scrub"
            type="range"
            min={START}
            max={END}
            value={Math.floor(minute)}
            aria-valuetext={`${timeLabel(minute)} UTC`}
            onInput={(event) => update(survey(Number(event.currentTarget.value)))}
          />
          <div className="archive-scene-controls tonga-controls">
            <button type="button" className="archive-scene-button" onClick={toggle}>
              {view.playing ? "Pause" : ended ? "Replay" : "Play"}
            </button>
            <button type="button" className="archive-scene-button" onClick={() => update(survey(ERUPTION))}>
              Eruption
            </button>
            <button type="button" className="archive-scene-button" onClick={() => update(survey(320))}>
              Water vapor
            </button>
            <button type="button" className="archive-scene-button" onClick={() => update(survey(ANTIPODE))}>
              Antipode
            </button>
          </div>
        </div>
        <div className="tonga-station">
          <label className="tonga-station-label">
            Ground station
            <select
              value={station.id}
              onChange={(event) => {
                const selected = stations.find((item) => item.id === event.currentTarget.value);
                if (selected) update(survey(selected.peak, selected));
              }}
            >
              {stations.map(({ id: code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <PressureChart station={station} minute={minute} />
        </div>
      </div>
    </>
  );
}
