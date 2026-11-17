import { useObservatoryEscape } from "../useObservatoryEscape";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animationDelta } from "../../globe/animation";
import { SOLAR_WIND_URL, XRAY_URL, solarWind, xrayFlux, type WindSample } from "../../sources/spaceWeather";
import { SolarReadouts } from "./SolarReadouts";
import { CHAPTERS, FLIGHT_END, solarFrame, windStreaks } from "./solarFlight";
import disk from "./solar-disk.webp?url";
import { useSpaceWeather } from "./useSpaceWeather";

const MOTION = "(prefers-reduced-motion: reduce)";
const SCRUB_STEP = 100;
type Playback = { at: number; playing: boolean };

function paint(style: CSSStyleDeclaration | undefined, at: number) {
  const { diskOpacity, windOpacity, veil, push, depart } = solarFrame(at);
  style?.setProperty("--sun-veil", String(veil));
  style?.setProperty("--solar-disk-opacity", String(diskOpacity));
  style?.setProperty("--solar-wind-opacity", String(windOpacity));
  style?.setProperty("--solar-disk-shift", `${depart * -82}%`);
  style?.setProperty("--solar-disk-scale", String(1 + push * 0.38));
  style?.setProperty("--solar-wind-shift", `${depart * 7}%`);
}

export function SunWatch({
  onClose,
  sample,
}: {
  onClose: () => void;
  sample?: WindSample | undefined;
}): JSX.Element {
  const wind = useSpaceWeather(SOLAR_WIND_URL, solarWind);
  const xray = useSpaceWeather(XRAY_URL, xrayFlux);
  const navigation = useStoryNavigation();
  const [reduced, setReduced] = useState(() => matchMedia(MOTION).matches);
  const [view, setView] = useState<Playback>({ at: FLIGHT_END, playing: false });
  const [inspecting, setInspecting] = useState<WindSample | null>(sample ?? null);
  const [image, setImage] = useState<"loading" | "ready" | "failed">("loading");
  const [finished, setFinished] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const clock = useRef(view);
  const transportId = useId();
  const selected = inspecting ?? wind.points.at(-1);
  const kept = selected
    ? navigation?.library.saved.some(
        ({ position }) => position.solar?.at === selected.at && position.solar.source === selected.source,
      )
    : false;

  const update = useCallback((next: Playback) => {
    clock.current = next;
    paint(stage.current?.style, next.at);
    setView(next);
  }, []);

  useLayoutEffect(() => {
    stage.current?.parentElement?.scrollTo(0, 0);
    stage.current
      ?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")
      ?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!view.playing || image === "loading") return;
    let previous = 0;
    let published = 0;
    let frame = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const delta = previous ? animationDelta((now - previous) / 1000) * 1000 : 0;
      const at = Math.min(FLIGHT_END, current.at + delta);
      previous = now;
      if (at >= FLIGHT_END) {
        update({ at, playing: false });
        setFinished(true);
        return;
      }
      if (now - published >= SCRUB_STEP || solarFrame(at).leg !== solarFrame(current.at).leg) {
        update({ at, playing: true });
        published = now;
      } else {
        clock.current = { at, playing: true };
        paint(stage.current?.style, at);
      }
      frame = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(frame);
      previous = 0;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [image, update, view.playing]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      setReduced(event.matches);
      if (event.matches && clock.current.playing) update({ at: FLIGHT_END, playing: false });
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, [update]);

  const { leg } = solarFrame(view.at);
  useStoryCompletion(finished);
  useObservatoryEscape(onClose);
  const caption =
    leg === "sun"
      ? image === "loading"
        ? "Loading archive image…"
        : image === "failed"
          ? "Solar image unavailable"
          : "NASA SDO archive · 10 Sep 2025"
      : leg === "wind"
        ? "Solar wind · schematic view"
        : "Earth · After Dark";

  function toggle() {
    const { at, playing } = clock.current;
    update({ at: !playing && at === FLIGHT_END ? 0 : at, playing: !playing });
  }

  return (
    <div
      ref={stage}
      className="observatory-stage sun-watch-stage"
      data-leg={leg}
      role="region"
      aria-label="Sun Watch readings"
    >
      <div className="sun-flight">
        <div className="sun-flight-plate" aria-hidden="true">
          <img
            className="sun-archive-disk"
            src={disk}
            alt=""
            onLoad={() => setImage("ready")}
            onError={() => setImage("failed")}
            hidden={image === "failed"}
          />
          <svg className="sun-wind-passage" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid slice">
            {windStreaks.map(({ path, opacity }) => (
              <path key={path} d={path} opacity={opacity} />
            ))}
          </svg>
        </div>
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
                onClick={() => update({ at, playing: false })}
              >
                {label}
              </button>
            ))}
          </div>
          {!reduced && (
            <button type="button" onClick={toggle} disabled={image === "loading"}>
              {view.playing
                ? "Pause"
                : view.at < FLIGHT_END
                  ? "Play"
                  : finished
                    ? "Replay"
                    : "Start solar flight"}
            </button>
          )}
        </div>
        {!reduced && (view.at < FLIGHT_END || finished) && (
          <div className="sun-flight-timeline">
            <label htmlFor={transportId}>Flight time</label>
            <input
              id={transportId}
              type="range"
              min={0}
              max={FLIGHT_END}
              step={SCRUB_STEP}
              className="scrub-slider"
              value={Math.round(view.at / SCRUB_STEP) * SCRUB_STEP}
              aria-valuetext={`${(view.at / 1000).toFixed(1)} seconds`}
              onChange={(event) => update({ at: event.currentTarget.valueAsNumber, playing: false })}
            />
          </div>
        )}
        <SolarReadouts wind={wind} xray={xray} inspecting={inspecting} onInspect={setInspecting}>
          {selected && navigation && (
            <button
              className="sun-keep"
              type="button"
              disabled={kept}
              onClick={() => {
                const visit = navigation.current();
                if (!visit) return;
                setInspecting(selected);
                navigation.library.save({ ...visit, position: { ...visit.position, solar: selected } });
              }}
            >
              {kept ? "Reading kept" : "Keep this reading"}
            </button>
          )}
        </SolarReadouts>
      </div>
    </div>
  );
}
