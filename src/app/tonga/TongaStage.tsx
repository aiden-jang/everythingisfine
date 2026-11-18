import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { useWorldLayout } from "../useWorldLayout";
import { PlaybackButton } from "../PlaybackButton";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { StoryDock } from "../observations/StoryDock";
import { WorldEvidence } from "../observations/WorldEvidence";
import { ReplayInset } from "../observations/ReplayInset";
import { ShareMoment, useStorySession } from "../observations/StorySession";
import { tongaGeography, tongaTarget } from "./tongaGlobe";
import { paintTongaScan } from "./drawTonga";
import { PressureChart } from "./PressureChart";
import { KeepPressure } from "./KeepPressure";
import { TongaPressure } from "./TongaPressure";
import { TongaKept } from "./TongaKept";
import { TongaWorld, type TongaPhase } from "./TongaWorld";
import { pressureShare } from "./pressureShare";
import { useTongaPlayback } from "./useTongaPlayback";
import {
  ANTIPODE,
  END,
  ERUPTION,
  START,
  infrared,
  layersAt,
  latestScan,
  orbit,
  pressureAt,
  sprite,
  signalStation,
  stationAt,
  stations,
  timeIso,
  timeLabel,
  vapor,
} from "./tongaTimeline";

export function TongaStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, shared, remember } = useStorySession();
  const playback = useTongaPlayback(initial);
  const { assets, view, images, minute, ended, arrive } = playback;
  const [phase, setPhase] = useState<TongaPhase>(() => {
    if (initial?.at === undefined) return "discover";
    const selected = stations.find(({ id }) => id === initial.choice);
    const at = (initial.at - Date.parse(timeIso(0))) / 60_000;
    return initial.chapter === "pressure" && selected && pressureAt(selected, at) !== null
      ? shared
        ? "shared"
        : "inspect"
      : "follow";
  });
  const signal = phase === "follow" ? signalStation(minute, view.station) : undefined;
  const station = view.station ?? signal ?? stationAt(minute);
  const focus = useRef<"sample" | "playback" | "kept" | null>(null);
  useLayoutEffect(() => {
    const zones = document.querySelector<HTMLElement>(".zones");
    if (zones) zones.dataset["tongaPhase"] = phase;
    const selector =
      focus.current === "sample"
        ? ".pressure-sample-slider"
        : focus.current === "playback"
          ? ".story-playback"
          : focus.current === "kept"
            ? ".tonga-kept .story-share button"
            : null;
    focus.current = null;
    if (selector) zones?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    return () => {
      if (zones) delete zones.dataset["tongaPhase"];
    };
  }, [phase]);
  useWorldLayout(`tonga:${phase}`);

  const anchor = view.anchor;
  const framing = ["inspect", "shared", "kept"].includes(phase) ? station.peak : anchor;
  const target = useMemo(() => {
    if (phase === "discover") return { lon: -162, lat: -4, zoom: 0.85 };
    if (framing === undefined) return tongaTarget;
    const shot = orbit(framing);
    return { lon: shot.lon, lat: shot.lat, zoom: 0.65 + shot.scale * 0.47 };
  }, [framing, phase]);
  useLayoutEffect(() => {
    const geographic = tongaGeography(minute, station, anchor);
    onView({
      kind: "observation",
      ...geographic,
      ...(phase !== "follow" ? { follow: undefined } : {}),
      image: null,
      target,
      arrive,
    });
    remember?.({
      choice: station.id,
      chapter: ["inspect", "kept", "shared"].includes(phase) ? "pressure" : "journey",
    });
  }, [minute, station, anchor, target, onView, arrive, remember, phase]);
  useStoryCompletion(ended && !view.playing);

  const hasInfrared = images.infrared !== null,
    hasVapor = images.vapor !== null;
  const { vaporMix, orbitMix } = layersAt(minute, hasInfrared, hasVapor, anchor !== undefined);
  const isOrbit = orbitMix >= 0.5,
    isVapor = !isOrbit && vaporMix >= 0.5;
  const scans = isVapor ? vapor : infrared;
  const scan = scans[latestScan(scans, minute)]!;
  const hasImage = Boolean(isVapor ? images.vapor : images.infrared);
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

  function inspect(next: number, selected = station) {
    playback.seek(next, selected);
    focus.current = "sample";
    setPhase("inspect");
  }
  function journey(restart: boolean) {
    if (restart) playback.begin();
    focus.current = "playback";
    setPhase("follow");
  }
  function kept() {
    focus.current = "kept";
    setPhase("kept");
  }
  const overview = phase === "discover";
  const inspecting = phase === "inspect" || phase === "shared";

  return (
    <ReplayPanel
      {...panel}
      className="tonga-experience"
      sharing={false}
      ending={false}
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
        <>
          {orbitMix < 1 && (hasInfrared || hasVapor) && (
            <ReplayInset
              label={caption}
              width={sprite.width}
              height={sprite.height}
              opacity={1 - orbitMix}
              paint={(ctx) => paintTongaScan(ctx, minute, images, vaporMix, anchor !== undefined)}
            />
          )}
          <TongaWorld
            phase={phase}
            station={station}
            signal={signal}
            onInspect={(selected) => inspect(selected.peak, selected)}
          />
        </>
      }
      evidence={
        <WorldEvidence state={phase}>
          {inspecting ? (
            <TongaPressure
              station={station}
              minute={minute}
              map={panel.map}
              shared={phase === "shared"}
              onSeek={inspect}
              onKeep={kept}
              onJourney={journey}
            />
          ) : phase === "kept" ? (
            <TongaKept onInspect={inspect} onJourney={() => journey(false)} />
          ) : null}
        </WorldEvidence>
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
      <div className="tonga-narrative">
        <h3>
          {overview ? (
            <>
              One eruption.
              <br />A global echo.
            </>
          ) : phase === "inspect" ? (
            <>
              A pulse,
              <br />
              recorded.
            </>
          ) : phase === "kept" ? (
            <>
              A moment
              <br />
              worth keeping.
            </>
          ) : phase === "shared" ? (
            <>
              A pulse,
              <br />
              across the Pacific.
            </>
          ) : (
            title
          )}
        </h3>
        <p>
          {overview
            ? "Follow Tonga’s pressure wave across the Pacific. Then see what a weather station actually recorded."
            : phase === "inspect"
              ? "A station records the passing disturbance. Scrub its one-minute pressure readings."
              : phase === "kept"
                ? "The reading stays attached to its place, time and source."
                : phase === "shared"
                  ? "A finding from Tonga’s shockwave, opened at a measured station reading."
                  : help}
        </p>
        {overview && (
          <>
            <p className="tonga-event-date">15 January 2022</p>
            <button type="button" className="tonga-primary" onClick={() => journey(true)}>
              Follow the wave
            </button>
          </>
        )}
      </div>
      {phase === "follow" && (
        <div className="archive-scene-console">
          {(assets === "partial" || assets === "error") && (
            <p className="observation-note" role="status">
              {assets === "partial"
                ? images.infrared
                  ? "Water-vapor imagery unavailable. Infrared and pressure readings remain available."
                  : "Infrared imagery unavailable. Water-vapor and pressure readings remain available."
                : "Satellite scans unavailable. The estimated wave and pressure readings remain available."}
            </p>
          )}
          <div className="archive-scene-controls" role="group" aria-label="Tonga chapters">
            <button type="button" aria-pressed={!isVapor && !isOrbit} onClick={() => playback.seek(ERUPTION)}>
              Eruption
            </button>
            <button type="button" aria-pressed={isVapor && !isOrbit} onClick={() => playback.seek(320)}>
              Water vapor
            </button>
            <button type="button" aria-pressed={minute >= ANTIPODE} onClick={() => playback.seek(ANTIPODE)}>
              Antipode
            </button>
          </div>
          <div className="tonga-station">
            <label className="tonga-station-label">
              Ground station
              <select
                value={station.id}
                onChange={(event) => {
                  const next = stations.find(({ id }) => id === event.currentTarget.value)!;
                  playback.seek(next.peak, next);
                }}
              >
                {stations.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <PressureChart station={station} minute={minute} />
            <button
              type="button"
              className="tonga-inspect"
              onClick={() =>
                inspect(pressureAt(station, minute) === null ? station.peak : Math.floor(minute))
              }
            >
              Inspect {station.name}’s record
            </button>
            <KeepPressure station={station} minute={minute} map={panel.map} onKept={kept} />
          </div>
          <ShareMoment share={pressureShare} />
        </div>
      )}
      {phase === "follow" && (
        <StoryDock>
          <div className="tonga-time story-dock-time">
            <label htmlFor="tonga-replay-time">Replay time</label>
            <time dateTime={timeIso(minute)}>{timeLabel(minute)} UTC</time>
          </div>
          <input
            id="tonga-replay-time"
            className="scrub-slider tonga-scrub"
            type="range"
            min={START}
            max={END}
            value={Math.floor(minute)}
            aria-valuetext={`${timeLabel(minute)} UTC`}
            onInput={(event) => playback.scrub(event.currentTarget.valueAsNumber)}
          />
          <div className="archive-scene-controls">
            <PlaybackButton
              playing={view.playing}
              ended={ended}
              className="archive-scene-button"
              onClick={playback.toggle}
            />
          </div>
        </StoryDock>
      )}
    </ReplayPanel>
  );
}
