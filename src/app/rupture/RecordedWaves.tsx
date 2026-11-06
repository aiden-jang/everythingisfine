import { useEffect, useId, useRef, useState } from "react";
import { rings, unwrap } from "../../geo/land";
import stations from "../../sources/observations/recordings/tohoku-waves.json";

const origin = Date.parse("2011-03-11T05:46:24Z");
const duration = 90 * 60;
const scale = 900;
const audioFiles = import.meta.glob<string>("../../sources/observations/recordings/*.mp3", {
  eager: true,
  import: "default",
  query: "?url",
});
const width = 720;
const globeY = (lat: number) => (90 - lat) * (300 / 180);
const mapX = (lon: number) => ((lon + 360) % 360) * 2;
const coast = rings()
  .flatMap((polygon) =>
    polygon.flatMap((path) => {
      const unwrapped = unwrap(path);
      const offset = 360 * Math.round((180 - unwrapped.mean) / 360);
      return [-360, 0, 360].map(
        (repeat) =>
          unwrapped.ring
            .map(
              ([lon, lat], i) =>
                `${i ? "L" : "M"}${((lon! + offset + repeat) * 2).toFixed(1)} ${globeY(lat!).toFixed(1)}`,
            )
            .join(" ") + " Z",
      );
    }),
  )
  .join(" ");

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

export function RecordedWaves({ back }: { back: () => void }): JSX.Element {
  const [first, setFirst] = useState(0);
  const [second, setSecond] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [playing, play] = useState(false);
  const clip = useId();
  const cursor = useRef<HTMLInputElement>(null);
  const sound = useRef<HTMLAudioElement>(null);
  const a = waves[first]!;
  const b = waves[second]!;
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
      <figure className="archive-scene-map recorded-waves">
        <svg
          className="recorded-world"
          viewBox="0 0 720 300"
          role="img"
          aria-label="Pacific-centered map of seven recording stations and the Tōhoku epicenter"
        >
          <defs>
            <clipPath id={clip}>
              <rect width="720" height="300" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <g className="recorded-world-geometry">
              <path d={coast} className="recorded-coast" />
              <circle cx={mapX(142.373)} cy={globeY(38.297)} r="7" className="recorded-epicenter" />
              {waves.map((station) => {
                const sample =
                  station.envelope[Math.min(station.envelope.length - 1, Math.floor(seconds / 5))];
                const amplitude = sample ? Math.max(Math.abs(sample[0]!), Math.abs(sample[1]!)) : 0;
                return (
                  <circle
                    key={station.id}
                    cx={mapX(station.lon)}
                    cy={globeY(station.lat)}
                    r={3.5 + Math.sqrt(amplitude / 1000) * 10}
                    className="recorded-station"
                    data-selected={station === a ? "first" : station === b ? "second" : undefined}
                  >
                    <title>{station.name}</title>
                  </circle>
                );
              })}
            </g>
          </g>
        </svg>
        <div className="recorded-traces">
          <Trace station={a} seconds={seconds} />
          <Trace station={b} seconds={seconds} second />
        </div>
      </figure>
      <div className="archive-scene-console recorded-console">
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
