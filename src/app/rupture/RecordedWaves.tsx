import { useCallback, useMemo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ObservationView } from "../observations/types";
import stations from "../../sources/observations/recordings/tohoku-waves.json";
import { useStorySession } from "../observations/StorySession";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { EvidenceConnector } from "../observations/EvidenceConnector";
import { StoryDock } from "../observations/StoryDock";
import { WaveStationPicker } from "./WaveStationPicker";

const origin = Date.parse("2011-03-11T05:46:24Z");
const duration = 90 * 60;
const scale = 900;
const audioFiles = import.meta.glob<string>("../../sources/observations/recordings/*.mp3", {
  eager: true,
  import: "default",
  query: "?url",
});
const width = 720;
const target = { lon: 177, lat: 35, zoom: 0.94 };

const waves = stations.map((station) => ({
  ...station,
  audio: audioFiles[`../../sources/observations/recordings/${station.id}.mp3`]!,
  trace: station.envelope
    .map((sample, index) => {
      if (!sample) return "";
      const x = (((index * 5) / duration) * width).toFixed(2);
      return `M${x} ${(30 - sample[0]! * 0.028).toFixed(2)}V${(30 - sample[1]! * 0.028).toFixed(2)}`;
    })
    .join(" "),
}));
type Station = (typeof waves)[number];
export interface WaveReading {
  first: number;
  second: number;
  seconds: number;
}
export type WavePin = Pick<Station, "id" | "name" | "lon" | "lat"> & {
  reached: boolean;
  slot?: "first" | "second";
  linked: boolean;
  inspect: () => void;
};

const reached = (station: Station, seconds: number) => station.first !== null && seconds >= station.first;

function OnsetInterval({ a, b }: { a: Station; b: Station }) {
  if (a.first === null || b.first === null) return null;
  const [earlier, later] = a.first <= b.first ? [a, b] : [b, a];
  const diff = later.first! - earlier.first!;
  const x1 = (earlier.first! / duration) * width;
  const x2 = (later.first! / duration) * width;
  return (
    <div className="wave-onset-interval">
      <svg viewBox={`0 0 ${width} 12`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`M${x1} 2V9H${x2}V2`} />
      </svg>
      <p>
        {earlier.id} → {later.id} · about {Math.floor(diff / 60)} min {diff % 60} sec between onsets
      </p>
    </div>
  );
}

function waveTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
}
const timeAt = (seconds: number) =>
  new Date(origin + Math.round(seconds) * 1000).toISOString().slice(11, 19) + " UTC";

function Trace({
  station,
  seconds,
  second,
  linked,
}: {
  station: Station;
  seconds: number;
  second?: boolean;
  linked?: boolean;
}) {
  const x = (seconds / duration) * width;
  return (
    <div
      className="recorded-trace"
      data-second={second || undefined}
      data-evidence-body=""
      data-reached={reached(station, seconds) || undefined}
    >
      <div>
        <strong data-ramp="">{station.id}</strong> · {station.name}{" "}
        <span>
          {station.first === null
            ? "Onset unclear"
            : `${reached(station, seconds) ? "Reached" : "Onset"} at +${waveTime(station.first)}`}
        </span>
      </div>
      <svg
        data-ramp=""
        viewBox={`0 0 ${width} 60`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${station.name}, normalized vertical motion for the first 90 minutes`}
      >
        <path className="recorded-base" d={`M0 30H${width}`} />
        <path d={station.trace} />
        {station.first !== null && (
          <line
            className="recorded-onset"
            x1={(station.first / duration) * width}
            x2={(station.first / duration) * width}
            y1="0"
            y2="60"
          />
        )}
        <line
          className="recorded-cursor"
          data-evidence-point={linked || undefined}
          x1={x}
          x2={x}
          y1="0"
          y2="60"
        />
      </svg>
    </div>
  );
}

export function RecordedWaves({
  back,
  backLabel,
  initialReading,
  onReading,
  onPins,
  onView,
  reduced,
}: {
  back: () => void;
  backLabel: string;
  initialReading?: WaveReading | undefined;
  onReading: (reading: WaveReading) => void;
  onPins: (pins: WavePin[]) => void;
  onView: (view: ObservationView) => void;
  reduced: boolean;
}): JSX.Element {
  const { initial, remember } = useStorySession();
  const navigation = useStoryNavigation();
  const selection = initial?.choice?.split(",").map(Number);
  const valid = (n: number | undefined, fallback: number) =>
    n !== undefined && Number.isInteger(n) && n >= 0 && n < waves.length ? n : fallback;
  const [first, setFirst] = useState(initialReading?.first ?? valid(selection?.[0], 0));
  const [second, setSecond] = useState(() => {
    const picked = initialReading?.second ?? valid(selection?.[1], 3);
    return picked === first ? (first + 1) % waves.length : picked;
  });
  const [seconds, setSeconds] = useState(
    initialReading?.seconds ??
      (initial?.chapter === "waves"
        ? Math.max(0, Math.min(duration, ((initial.at ?? origin) - origin) / 1000))
        : 0),
  );
  const [playing, play] = useState(false);
  const [linked, setLinked] = useState(false);
  const cursor = useRef<HTMLInputElement>(null);
  const sound = useRef<HTMLAudioElement>(null);
  const a = waves[first]!;
  const b = waves[second]!;
  const inspect = useCallback(
    (index: number) => {
      play(false);
      sound.current?.pause();
      if (index === second) setSecond(first);
      setFirst(index);
      setLinked(true);
      requestAnimationFrame(() =>
        document.querySelector(".recorded-trace")?.scrollIntoView({ block: "nearest" }),
      );
    },
    [first, second],
  );
  const arrivalMask = waves.reduce(
    (mask, station, index) => (reached(station, seconds) ? mask | (1 << index) : mask),
    0,
  );
  const pins = useMemo(
    () =>
      [first, second, ...waves.map((_, i) => i).filter((i) => i !== first && i !== second)].map(
        (index): WavePin => {
          const { id, name, lon, lat } = waves[index]!;
          return {
            id,
            name,
            lon,
            lat,
            reached: !!(arrivalMask & (1 << index)),
            ...(index === first ? { slot: "first" } : index === second ? { slot: "second" } : {}),
            linked: index === first && linked,
            inspect: () => inspect(index),
          };
        },
      ),
    [first, second, arrivalMask, linked, inspect],
  );
  useLayoutEffect(() => onPins(pins), [pins, onPins]);
  const at = origin + seconds * 1000;
  const choice = `${first},${second}`;
  const kept = navigation?.library.saved.some(
    ({ position }) =>
      position.moment?.id === "rupture" &&
      position.moment.chapter === "waves" &&
      position.moment.at === at &&
      position.moment.choice === choice,
  );
  useLayoutEffect(() => {
    onView({
      kind: "observation",
      cameraKey: "waves",
      image: null,
      target,
      holdGeography: linked,
      pickMarks: { points: waves, select: inspect },
      frame: {
        at,
        marks: [
          { lon: 142.373, lat: 38.297, size: 19, color: 0xe8edf5 },
          ...waves.map((station) => {
            const sample = station.envelope[Math.min(station.envelope.length - 1, Math.floor(seconds / 5))];
            const amplitude = sample ? Math.max(Math.abs(sample[0]!), Math.abs(sample[1]!)) : 0;
            const arrived = reached(station, seconds);
            const color = station === a ? 0xf2be95 : station === b ? 0xa6dce9 : 0xaebcc9;
            const selected = station === a || station === b;
            const pulse =
              arrived && playing && !reduced ? Math.max(0, 1 - (seconds - station.first!) / 120) : 0;
            return {
              lon: station.lon,
              lat: station.lat,
              size: arrived ? (selected ? 13 : 9) + Math.sqrt(amplitude / 1000) * 12 + pulse * 9 : 7,
              color: arrived ? color : 0x657786,
            };
          }),
        ],
      },
    });
    remember?.({ chapter: "waves", choice });
    onReading({ first, second, seconds });
  }, [
    at,
    choice,
    seconds,
    a,
    b,
    first,
    second,
    onView,
    onReading,
    remember,
    playing,
    reduced,
    linked,
    inspect,
  ]);
  const running = playing && seconds < duration;
  useEffect(() => cursor.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const pauseHidden = () => {
      if (document.hidden) sound.current?.pause();
    };
    document.addEventListener("visibilitychange", pauseHidden);
    return () => document.removeEventListener("visibilitychange", pauseHidden);
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setSeconds((at) => Math.min(duration, at + 24));
    }, 80);
    return () => window.clearInterval(timer);
  }, [running]);
  const seek = (at: number) => {
    play(false);
    setSeconds(at);
  };
  return (
    <>
      <div className="archive-scene-console">
        <div className="archive-scene-caption recorded-chapter">
          <h3>Two stations. One event.</h3>
          <p>
            Tap a station to inspect its trace. Stations light up at the approximate recorded onset. The
            traces share one clock and are normalized per instrument.
          </p>
        </div>
        <div className="recorded-controls">
          <div className="recorded-pickers">
            <WaveStationPicker
              stations={waves}
              label="First station"
              index={first}
              other={second}
              select={setFirst}
            />
            <WaveStationPicker
              stations={waves}
              label="Second station"
              index={second}
              other={first}
              select={setSecond}
            />
          </div>
          <div className="recorded-traces">
            <Trace station={a} seconds={seconds} linked={linked} />
            <Trace station={b} seconds={seconds} second />
            <OnsetInterval a={a} b={b} />
          </div>
          {linked && <EvidenceConnector key={a.id} trace />}
          <StoryDock label="Recorded wave playback">
            <label className="recorded-time">
              <span>Recording time · {timeAt(seconds)}</span>
              <input
                ref={cursor}
                className="scrub-slider"
                type="range"
                min="0"
                max={duration}
                step="1"
                value={seconds}
                aria-valuetext={timeAt(seconds)}
                onChange={(event) => seek(event.currentTarget.valueAsNumber)}
              />
            </label>
            <button
              data-playback-start={!running || undefined}
              type="button"
              className="archive-scene-button"
              onClick={() => {
                if (seconds >= duration) setSeconds(0);
                play(!running);
              }}
            >
              {running ? "Pause recording" : seconds >= duration ? "Replay recording" : "Play recording"}
            </button>
          </StoryDock>
          <div className="archive-scene-controls">
            {a.first !== null && (
              <button type="button" className="archive-scene-button" onClick={() => seek(a.first!)}>
                Jump to {a.id} onset
              </button>
            )}
            {b.first !== null && (
              <button type="button" className="archive-scene-button" onClick={() => seek(b.first!)}>
                Jump to {b.id} onset
              </button>
            )}
            {navigation && (
              <button
                type="button"
                className="recorded-primary"
                disabled={kept}
                onClick={() => {
                  const visit = navigation.current();
                  if (visit) navigation.library.save(visit);
                }}
              >
                {kept ? "Comparison kept" : "Keep this comparison"}
              </button>
            )}
            <button type="button" className="archive-scene-button" onClick={back}>
              {backLabel}
            </button>
          </div>
          {navigation?.library.notice && (
            <p role="status" className="observation-note">
              {navigation.library.notice}
            </p>
          )}
          <details
            className="recorded-audio"
            onToggle={(event) => {
              if (!event.currentTarget.open) sound.current?.pause();
            }}
          >
            <summary onClick={() => play(false)}>
              Listen to {a.id} · {scale}× speed
            </summary>
            <audio
              ref={sound}
              key={a.id}
              controls
              preload="none"
              onPlay={() => play(false)}
              aria-label={`Sonification of ${a.name} at ${scale} times speed`}
              src={a.audio}
            />
            <p>Recorded motion sped up into audible sound.</p>
          </details>
        </div>
      </div>
    </>
  );
}
