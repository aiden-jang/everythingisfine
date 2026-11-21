import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  blackMarbleSource,
  lightsBounds,
  lightsCorners,
  lightsLens,
  lightsPeriods,
  loadBlackMarble,
  mariaStudy,
  puertoRico,
} from "../../sources/observations/blackMarble";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { StoryDock } from "../observations/StoryDock";
import { useStorySession } from "../observations/StorySession";
import { StoryLoading } from "../StoryLoading";
import { lightsCities, lightsComparison } from "./lightsSurface";

const MOTION = "(prefers-reduced-motion: reduce)";
const LAST = lightsPeriods.length - 1;
const bounds = { bounds: lightsBounds, corners: lightsCorners, opacity: 1, feather: 0.045 };
const locator = [{ lon: puertoRico.lon, lat: puertoRico.lat, size: 19, color: 0xe6caa6 }];
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const sources = (
  <>
    <p>
      NASA Black Marble HD visualizations from Suomi NPP VIIRS. The three recovery periods are dated averages.
      The stills were aligned to the Natural Earth coast for comparison at island scale.
    </p>
    <a href={blackMarbleSource} target="_blank" rel="noreferrer">
      NASA Scientific Visualization Studio
    </a>
    <a href={mariaStudy} target="_blank" rel="noreferrer">
      Román and Stokes et al. · recovery study
    </a>
    <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">
      Natural Earth coast
    </a>
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
      © OpenStreetMap contributors
    </a>
  </>
);

export function LightsReturn({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const [images, setImages] = useState<HTMLImageElement[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [settled, setSettled] = useState(false);
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(LAST, Math.round(Number(initial?.choice) || 0))),
  );
  const [playing, setPlaying] = useState(() => !initial && !matchMedia(MOTION).matches);
  const [compare, setCompare] = useState(() => initial?.chapter?.startsWith("compare:") ?? false);
  const [split, setSplit] = useState(() => clamp(Number(initial?.chapter?.split(":")[1] ?? 50) || 0));
  const play = useRef<HTMLButtonElement>(null);
  const skip = useRef<HTMLButtonElement>(null);

  const period = lightsPeriods[index]!;
  const comparing = compare && index > 0;
  const displayed = comparing && split === 100 ? lightsPeriods[0] : period;
  const surface = useMemo(
    () => (comparing && images ? lightsComparison(images[0]!, images[index]!) : undefined),
    [comparing, images, index],
  );
  useStoryCompletion(index === LAST && !playing);

  useEffect(() => {
    let active = true;
    void loadBlackMarble().then(
      (next) => active && setImages(next),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const ready = useCallback(() => {
    if (document.activeElement === skip.current) play.current?.focus({ preventScroll: true });
    setArrived(true);
  }, []);
  const arrive = useCallback(
    (_scale: number, reduced: boolean) => {
      if (reduced) {
        setPlaying(false);
        ready();
      }
    },
    [ready],
  );
  const framing = useMemo(
    () => ({
      map: panel.map,
      onReady() {
        setSettled(true);
        ready();
      },
    }),
    [panel.map, ready],
  );

  useLayoutEffect(() => {
    if (!images) return;
    onView({
      kind: "observation",
      frame: arrived
        ? { at: period.at, raster: { ...bounds, url: period.image }, reconstruction: true }
        : { at: period.at, marks: locator },
      target: puertoRico,
      image: arrived ? images[index]! : null,
      ...(arrived && surface ? { surface, surveyDivider: split / 100 } : {}),
      capture: arrived,
      lens: lightsLens,
      arrive,
      comparisonFrame: framing,
      holdGeography: settled,
    });
    remember?.({ choice: String(index), chapter: comparing ? `compare:${split}` : "", map: panel.map });
  }, [
    images,
    onView,
    period,
    index,
    comparing,
    split,
    surface,
    arrived,
    arrive,
    framing,
    settled,
    panel.map,
    remember,
  ]);

  useEffect(() => {
    if (!arrived || !playing || index === LAST) return;
    let timer = 0;
    const step = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(
        () => {
          setIndex(index + 1);
          if (index + 1 === LAST) setPlaying(false);
        },
        index === 0 ? 2200 : 1800,
      );
    };
    step();
    document.addEventListener("visibilitychange", step);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", step);
    };
  }, [arrived, index, playing]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    const stop = () => {
      if (motion.matches) setPlaying(false);
    };
    motion.addEventListener("change", stop);
    return () => motion.removeEventListener("change", stop);
  }, []);

  return (
    <ReplayPanel
      {...panel}
      title="Lights Return"
      location="Puerto Rico"
      subtitle="Follow the uneven return of nighttime light after Hurricane Maria."
      className="lights-journey"
      status={failed ? "NASA image unavailable" : !arrived ? "Approaching the island" : displayed.title}
      at={arrived ? <span>{displayed.dates}</span> : null}
      inset={
        arrived && (
          <>
            <div className="lights-geography" aria-hidden="true">
              {lightsCities.map(({ id, name, lon, lat }) => (
                <span
                  key={id}
                  data-observation-anchor=""
                  data-compact-anchor=""
                  data-lon={lon}
                  data-lat={lat}
                >
                  {name}
                </span>
              ))}
            </div>
            <div className="lights-key" aria-label="Relative nighttime light intensity">
              <span>Dimmer</span>
              <i aria-hidden="true" />
              <span>Brighter</span>
            </div>
          </>
        )
      }
      sources={sources}
    >
      {!images && !failed && <StoryLoading>Loading NASA’s night-light archive…</StoryLoading>}
      {failed && (
        <div className="observatory-actions">
          <p className="observation-note" role="status" aria-label="Image loading status">
            NASA’s archived images couldn’t load.
          </p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              retry((n) => n + 1);
            }}
          >
            Retry images
          </button>
        </div>
      )}
      {images && (
        <>
          <div className="archive-scene-caption lights-reading" data-lights-period={index}>
            <h3>{period.title}</h3>
            <p>{period.note}</p>
          </div>
          <StoryDock label="Night-light playback" deferOnShortPhone={!arrived}>
            <div className="lights-transport">
              <div className="observation-transport">
                <span>Night-light period · {period.dates}</span>
                <input
                  className="scrub-slider observation-scrub"
                  type="range"
                  min={0}
                  max={LAST}
                  value={index}
                  aria-label="Night-light period"
                  aria-valuetext={`${period.title} · ${period.dates}`}
                  onChange={(event) => {
                    const selected = event.currentTarget.valueAsNumber;
                    if (!arrived) ready();
                    setPlaying(false);
                    setIndex(selected);
                    if (selected === 0) setCompare(false);
                  }}
                />
                <div className="observatory-actions">
                  {!arrived && (
                    <button ref={skip} type="button" onClick={ready}>
                      Skip approach
                    </button>
                  )}
                  <PlaybackButton
                    playing={playing}
                    ended={index === LAST}
                    buttonRef={play}
                    onClick={() => {
                      if (playing) setPlaying(false);
                      else {
                        if (index === LAST) setIndex(0);
                        setCompare(false);
                        setPlaying(true);
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-pressed={comparing}
                    disabled={!arrived || index === 0}
                    onClick={() => {
                      setPlaying(false);
                      setCompare(!comparing);
                    }}
                  >
                    Compare with before
                  </button>
                </div>
              </div>
              {comparing && (
                <div className="lights-comparison">
                  <div className="lights-dates">
                    <div>
                      <strong>Before Maria</strong>
                      <span>{lightsPeriods[0].dates}</span>
                    </div>
                    <div>
                      <strong>{period.title}</strong>
                      <span>{period.dates}</span>
                    </div>
                  </div>
                  <label>
                    <span>Before and after divider</span>
                    <input
                      className="scrub-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      aria-valuetext={`${split}% from left`}
                      onChange={(event) => setSplit(event.currentTarget.valueAsNumber)}
                    />
                  </label>
                </div>
              )}
            </div>
          </StoryDock>
        </>
      )}
    </ReplayPanel>
  );
}
