import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import {
  SOLAR_WIND_URL,
  SPACE_WEATHER_FRESHNESS,
  XRAY_URL,
  solarWind,
  xrayFlux,
  type WindSample,
} from "../../sources/spaceWeather";
import { SolarReadouts } from "./SolarReadouts";
import { CHAPTERS, FLIGHT_END, paintSolarFlight, solarFrame } from "./solarFlight";
import disk from "./solar-disk.webp?url";
import { useSpaceWeather } from "./useSpaceWeather";

const MOTION = "(prefers-reduced-motion: reduce)";

interface Playback {
  at: number;
  playing: boolean;
}

export function SunWatch({ onClose }: { onClose: () => void }): JSX.Element {
  const wind = useSpaceWeather(SOLAR_WIND_URL, solarWind);
  const xray = useSpaceWeather(XRAY_URL, xrayFlux);
  const [reduced, setReduced] = useState(() => matchMedia(MOTION).matches);
  const [view, setView] = useState<Playback>(() =>
    reduced ? { at: FLIGHT_END, playing: false } : { at: 0, playing: true },
  );
  const [image, setImage] = useState<HTMLImageElement | null | undefined>();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(view);
  const repaint = useRef(() => {});
  const windForFlight = useRef<WindSample>();
  const latestWind = wind.points.at(-1);
  const currentWind =
    latestWind && wind.status === "ok" && wind.now - latestWind.at <= SPACE_WEATHER_FRESHNESS
      ? latestWind
      : undefined;

  useLayoutEffect(() => {
    stage.current?.parentElement?.scrollTo(0, 0);
    stage.current
      ?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")
      ?.focus({ preventScroll: true });
  }, []);

  function update(next: Playback) {
    clock.current = next;
    repaint.current();
    setView(next);
  }

  useEffect(() => {
    const asset = new Image();
    let closed = false;
    asset.src = disk;
    void asset.decode().then(
      () => {
        if (!closed) setImage(asset);
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
      const { at } = clock.current;
      stage.current?.style.setProperty("--sun-veil", String(solarFrame(at).veil));
      if (width > 0 && height > 0)
        paintSolarFlight(ctx, width, height, at, image ?? null, windForFlight.current);
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

  const ready = image !== undefined && wind.status !== "waiting";
  useEffect(() => {
    if (!view.playing || !ready) return;
    let previous: number | undefined;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const delta = previous === undefined ? 0 : animationDelta((now - previous) / 1000) * 1000;
      const at = Math.min(FLIGHT_END, current.at + delta);
      previous = now;
      if (at >= FLIGHT_END) {
        update({ at, playing: false });
        return;
      }
      const next = { at, playing: true };
      clock.current = next;
      repaint.current();
      if (solarFrame(at).leg !== solarFrame(current.at).leg) setView(next);
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
  }, [ready, view.playing]);

  useEffect(() => {
    if (clock.current.at === 0 || !clock.current.playing) {
      windForFlight.current = currentWind;
      repaint.current();
    }
  }, [currentWind]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      setReduced(event.matches);
      if (event.matches && clock.current.playing) update({ at: FLIGHT_END, playing: false });
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  const { leg } = solarFrame(view.at);
  useStoryCompletion(view.at >= FLIGHT_END && !view.playing);
  const caption =
    leg === "sun"
      ? image === undefined
        ? "Loading archive image…"
        : image === null
          ? "Solar image unavailable"
          : "NASA SDO archive · 10 Sep 2025"
      : leg === "wind"
        ? "Solar wind · schematic view"
        : "Earth · After Dark";

  function toggle() {
    const { at, playing } = clock.current;
    if (playing) update({ at, playing: false });
    else {
      windForFlight.current = currentWind;
      update({ at: at === FLIGHT_END ? 0 : at, playing: true });
    }
  }

  return (
    <div
      ref={stage}
      className="observatory-stage sun-watch-stage"
      data-leg={leg}
      role="region"
      aria-label="Sun Watch readings"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="sun-flight">
        <canvas ref={canvas} aria-hidden="true" />
        <p className="sun-flight-caption">{caption}</p>
      </div>
      <div className="sun-console">
        <div className="sun-transport">
          <div className="sun-chapters" role="group" aria-label="Sun Watch views">
            {CHAPTERS.map(({ id, label, at }) => (
              <button
                key={id}
                type="button"
                aria-pressed={leg === id}
                onClick={() => {
                  windForFlight.current = currentWind;
                  update({ at, playing: false });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {!reduced && (
            <PlaybackButton playing={view.playing} ended={view.at === FLIGHT_END} onClick={toggle} />
          )}
        </div>
        <SolarReadouts wind={wind} xray={xray} />
      </div>
    </div>
  );
}
