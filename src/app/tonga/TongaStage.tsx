import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { ReplayInset } from "../observations/ReplayInset";
import { tongaGeography, tongaTarget } from "./tongaGlobe";
import { paintTongaScan, type Satellite } from "./drawTonga";
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
  orbit,
  sprite,
  stationAt,
  stations,
  timeIso,
  timeLabel,
  vapor,
} from "./tongaTimeline";

import { useStorySession } from "../observations/StorySession";

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

export function TongaStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const id = useId();
  const [assets, setAssets] = useState<Assets>("loading");
  const [view, setView] = useState<Playback>(() =>
    initial
      ? survey(
          Math.max(
            START,
            Math.min(
              END,
              ((initial.at ?? Date.parse(timeIso(ERUPTION))) - Date.parse("2022-01-15T00:00:00Z")) / 60000,
            ),
          ),
          stations.find((s) => s.id === initial.choice),
        )
      : matchMedia(MOTION).matches
        ? survey(ERUPTION)
        : initialFlight(),
  );
  const clock = useRef(view);
  const images = useRef<Satellite>({ infrared: null, vapor: null });
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);

  function update(next: Playback) {
    clock.current = next;
    setView(next);
  }

  useEffect(() => {
    let closed = false;
    void Promise.all([loadImage(infraredUrl), loadImage(vaporUrl)]).then(([ir, wv]) => {
      if (closed) return;
      images.current = { infrared: ir, vapor: wv };
      setAssets(ir && wv ? "ready" : ir || wv ? "partial" : "error");
    });
    return () => {
      closed = true;
    };
  }, []);

  useEffect(() => {
    if (!view.playing || assets === "loading" || !ready) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed = Math.min(
        duration(current),
        current.elapsed + (previous === undefined ? 0 : now - previous),
      );
      previous = now;
      const next = { ...current, elapsed, playing: elapsed < duration(current) };
      clock.current = next;
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
  }, [view.playing, assets, ready]);

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
  const anchor = view.anchor;
  const target = useMemo(() => {
    if (anchor === undefined) return tongaTarget;
    const shot = orbit(anchor);
    return { lon: shot.lon, lat: shot.lat, zoom: 0.65 + shot.scale * 0.47 };
  }, [anchor]);
  useLayoutEffect(() => {
    onView({ kind: "observation", ...tongaGeography(minute, station, anchor), image: null, target, arrive });
    remember?.({ choice: station.id });
  }, [minute, station, anchor, target, onView, arrive, remember]);
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
    <ReplayPanel
      {...panel}
      title="Tonga’s shockwave"
      location="Hunga Tonga–Hunga Haʻapai"
      subtitle="GOES-17 and ground pressure · 15 Jan 2022"
      status={
        assets === "loading"
          ? "Preparing satellite scans…"
          : !isOrbit && !hasImage
            ? "Satellite imagery unavailable for this chapter"
            : caption
      }
      at={
        hasImage && !isOrbit ? (
          <time dateTime={scan.at}>Scan {timeLabel(scan.minute)} UTC</time>
        ) : (
          <time dateTime={timeIso(minute)}>{timeLabel(minute)} UTC</time>
        )
      }
      inset={
        orbitMix < 1 &&
        (hasInfrared || hasVapor) && (
          <ReplayInset
            label={caption}
            width={sprite.width}
            height={sprite.height}
            opacity={1 - orbitMix}
            paint={(ctx) => paintTongaScan(ctx, minute, images.current, vaporMix, anchor !== undefined)}
          />
        )
      }
      sources={
        <>
          <a href="https://registry.opendata.aws/noaa-goes/" target="_blank" rel="noreferrer">
            NOAA GOES-17
          </a>
          <a
            href="https://mesonet.agron.iastate.edu/request/asos/1min.phtml"
            target="_blank"
            rel="noreferrer"
          >
            ASOS via Iowa Mesonet
          </a>
          <a href="https://doi.org/10.1038/s41586-022-05012-5" target="_blank" rel="noreferrer">
            Wave study
          </a>
        </>
      }
    >
      <div className="archive-scene-console">
        <div className="tonga-transport">
          <div className="archive-scene-caption">
            <h3>{title}</h3>
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
          <div className="archive-scene-controls">
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
          <p className="observation-note">{help}</p>
        </div>
      </div>
    </ReplayPanel>
  );
}
