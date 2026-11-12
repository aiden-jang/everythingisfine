import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ObservationView } from "../observations/types";
import stations from "../../sources/observations/recordings/tohoku-waves.json";

import { useStorySession } from "../observations/StorySession";

const origin = Date.parse("2011-03-11T05:46:24Z");
const duration = 90 * 60;
const scale = 900;
const audioFiles = import.meta.glob<string>("../../sources/observations/recordings/*.mp3", {
  eager: true,
  import: "default",
  query: "?url",
});
const width = 720;
const target = { lon: 170, lat: 35, zoom: 0.9 };

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

function waveTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
}
const timeAt = (seconds: number) =>
  new Date(origin + Math.round(seconds) * 1000).toISOString().slice(11, 19) + " UTC";

function Trace({ station, seconds, second }: { station: Station; seconds: number; second?: boolean }) {
  const x = (seconds / duration) * width;
  return (
    <div className="recorded-trace" data-second={second || undefined}>
      <div>
        <strong data-ramp="">{station.id}</strong> · {station.name}{" "}
        <span>{station.first === null ? "Onset unclear" : `Motion at +${waveTime(station.first)}`}</span>
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
        <line className="recorded-cursor" x1={x} x2={x} y1="0" y2="60" />
      </svg>
    </div>
  );
}

function StationPicker({
  label,
  index,
  other,
  select,
}: {
  label: string;
  index: number;
  other: number;
  select: (index: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={index} onChange={(event) => select(Number(event.currentTarget.value))}>
        {waves.map((station, i) => (
          <option key={station.id} value={i} disabled={i === other}>
            {station.name.split(",")[0]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RecordedWaves({
  back,
  onView,
}: {
  back: () => void;
  onView: (view: ObservationView) => void;
}): JSX.Element {
  const { initial, remember } = useStorySession();
  const selection = initial?.choice?.split(",").map(Number);
  const valid = (n: number | undefined, fallback: number) =>
    n !== undefined && Number.isInteger(n) && n >= 0 && n < waves.length ? n : fallback;
  const [first, setFirst] = useState(valid(selection?.[0], 0));
  const [second, setSecond] = useState(() => {
    const picked = valid(selection?.[1], 5);
    return picked === first ? (first + 1) % waves.length : picked;
  });
  const [seconds, setSeconds] = useState(
    initial?.chapter === "waves"
      ? Math.max(0, Math.min(duration, ((initial.at ?? origin) - origin) / 1000))
      : 0,
  );
  const [playing, play] = useState(false);
  const cursor = useRef<HTMLInputElement>(null);
  const sound = useRef<HTMLAudioElement>(null);
  const a = waves[first]!;
  const b = waves[second]!;
  useLayoutEffect(() => {
    onView({
      kind: "observation",
      image: null,
      target,
      frame: {
        at: origin + seconds * 1000,
        marks: [
          { lon: 142.373, lat: 38.297, size: 19, color: 0xe8edf5 },
          ...waves.map((station) => {
            const sample = station.envelope[Math.min(station.envelope.length - 1, Math.floor(seconds / 5))];
            const amplitude = sample ? Math.max(Math.abs(sample[0]!), Math.abs(sample[1]!)) : 0;
            return {
              lon: station.lon,
              lat: station.lat,
              size: 8 + Math.sqrt(amplitude / 1000) * 20,
              color: station === a ? 0x8fe7e8 : station === b ? 0xf0bd8e : 0x8fa7ba,
            };
          }),
        ],
      },
    });
    remember?.({ chapter: "waves", choice: `${first},${second}` });
  }, [seconds, a, b, first, second, onView, remember]);
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
      <div className="recorded-traces">
        <Trace station={a} seconds={seconds} />
        <Trace station={b} seconds={seconds} second />
      </div>
      <div className="archive-scene-console">
        <div className="archive-scene-caption">
          <h3>When Earth Rings</h3>
          <p>
            Seven seismometers recorded the same earthquake. Compare two stations on the same clock. Trace
            height is normalized per instrument. Dotted lines mark approximate onsets detected from the
            recordings.
          </p>
          <a
            className="observation-source"
            href="https://ds.iris.edu/ds/nodes/dmc/specialevents/2011/03/11/tohoku-japan-earthquake/"
            target="_blank"
            rel="noreferrer"
          >
            EarthScope · Global Seismographic Network
          </a>
        </div>
        <div className="recorded-controls">
          <div className="recorded-pickers">
            <StationPicker label="First station" index={first} other={second} select={setFirst} />
            <StationPicker label="Second station" index={second} other={first} select={setSecond} />
          </div>
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
          <div className="archive-scene-controls">
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
            <button type="button" className="archive-scene-button" onClick={back}>
              Back to surface shaking
            </button>
          </div>
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
