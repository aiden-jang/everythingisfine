import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { PlaybackButton } from "../PlaybackButton";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ObservationRaster } from "../observations/types";
import { useObservationImage } from "../observations/useObservationData";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { StoryDock } from "../observations/StoryDock";
import { coastlineDivider, drawLavaComparison, drawLavaSurface } from "./drawLava";
import { KilaueaFootage } from "./KilaueaFootage";
import { COAST_COMPARISON, LAST, OCEAN_ENTRY, mapDate, snapshots } from "./lavaTimeline";
import relief from "./relief.webp?url";
import { useStorySession } from "../observations/StorySession";
import { nearest } from "../../sources/observations/common";

const fissure = { lon: -154.918, lat: 19.463, zoom: 2.4 };
const coastalSurvey = { lon: -154.818, lat: 19.514, zoom: 2.4 };
const lens = { globe: 82, map: 235 };
// NAD83 / UTM 5N corners of the 3DEP tile, converted to geographic coordinates.
const raster: ObservationRaster = {
  url: "",
  bounds: [-155.109, 19.314, -154.608, 19.736],
  corners: [
    { lon: -155.10338, lat: 19.31478 },
    { lon: -154.60863, lat: 19.31982 },
    { lon: -155.10876, lat: 19.73021 },
    { lon: -154.61275, lat: 19.73536 },
  ],
  opacity: 1,
};
const MOTION = "(prefers-reduced-motion: reduce)";

export function KilaueaJourney({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const navigation = useStoryNavigation();
  const [index, setIndex] = useState(
    initial?.at === undefined
      ? 0
      : snapshots.indexOf(nearest(snapshots, initial.at, (snapshot) => Date.parse(snapshot.at))!),
  );
  const [split, setSplit] = useState<number | null>(
    initial?.chapter === "compare"
      ? Math.max(
          0,
          Math.min(100, Number.isFinite(Number(initial.choice)) ? Number(initial.choice) : COAST_COMPARISON),
        )
      : null,
  );
  const [invited, setInvited] = useState(!initial);
  const [playing, setPlaying] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [footage, setFootage] = useState(false);
  const replayIndex = useRef(index);
  const playButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [surface] = useState(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1300;
    canvas.height = 1150;
    return canvas;
  });
  const { element, status } = useObservationImage(relief);
  const arrive = useCallback(() => setArrived(true), []);
  const comparing = split !== null;
  const atlas = useMemo(() => (comparing ? drawLavaComparison(element) : null), [comparing, element]);
  const target = comparing || index >= OCEAN_ENTRY ? coastalSurvey : fissure;
  const at = snapshots[comparing ? LAST : index]!.at;
  const kept =
    comparing &&
    navigation?.library.saved.some(
      (entry) =>
        entry.id === "kilauea" &&
        entry.position.moment?.chapter === "compare" &&
        entry.position.moment.choice === String(split),
    );
  useStoryCompletion(comparing || (index === LAST && !playing));
  const title = comparing
    ? "Where ocean became land."
    : invited
      ? "From fissure to sea."
      : index < 2
        ? "Fissure 8 reopens"
        : index < OCEAN_ENTRY
          ? "Across lower Puna"
          : index === OCEAN_ENTRY
            ? "Lava reaches Kapoho Bay"
            : "The lava delta grows";
  const time =
    split === null
      ? mapDate(at)
      : split === 0
        ? "Before the eruption"
        : split === 100
          ? "August 9 coastline"
          : `Shoreline divider at ${split}%`;

  useLayoutEffect(() => {
    if (!comparing) drawLavaSurface(surface, index, element);
  }, [index, element, surface, comparing]);

  useLayoutEffect(() => {
    onView({
      capture: !footage || panel.map,
      kind: "observation",
      frame: { at: Date.parse(at), raster },
      target,
      image: null,
      surface: atlas ?? surface,
      ...(split !== null ? { surveyDivider: coastlineDivider(split) } : {}),
      lens,
      arrive,
    });
    remember?.({ chapter: comparing ? "compare" : "", choice: String(split ?? "") });
  }, [arrive, atlas, at, comparing, element, footage, onView, panel.map, remember, split, surface, target]);

  useEffect(() => {
    if (!playing || !arrived) return;
    let timer = 0;
    function schedule() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        if (index < LAST) setIndex(index + 1);
        else {
          setPlaying(false);
          replayIndex.current = LAST;
          setSplit(COAST_COMPARISON);
        }
      }, 820);
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [playing, arrived, index]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    const stop = (event: MediaQueryListEvent) => {
      if (event.matches) setPlaying(false);
    };
    motion.addEventListener("change", stop);
    return () => motion.removeEventListener("change", stop);
  }, []);

  function inspect(next: number) {
    setInvited(false);
    setPlaying(false);
    setFootage(false);
    setSplit(null);
    setIndex(next);
  }

  function compare() {
    replayIndex.current = index;
    setInvited(false);
    setPlaying(false);
    setFootage(false);
    setSplit(COAST_COMPARISON);
  }

  function follow() {
    if (matchMedia(MOTION).matches) {
      compare();
      return;
    }
    if (comparing || index === LAST) inspect(0);
    setInvited(false);
    setFootage(false);
    setPlaying((current) => !current);
    if (invited) requestAnimationFrame(() => playButton.current?.focus({ preventScroll: true }));
  }

  return (
    <ReplayPanel
      {...panel}
      onMap={(map) => {
        if (map) setFootage(false);
        panel.onMap(map);
      }}
      finding={false}
      save={!comparing}
      className="kilauea-journey"
      title="Kīlauea"
      subtitle="Hawaiʻi Island · 2018"
      location="Lower East Rift Zone"
      status={
        footage && !panel.map
          ? "USGS overflight · June 4, 2018"
          : comparing
            ? "USGS · Registered shoreline survey"
            : arrived
              ? "USGS · Mapped lava extent"
              : "Approaching Hawaiʻi Island"
      }
      at={
        <span>
          {comparing
            ? split === 0
              ? "Before eruption"
              : split === 100
                ? "August 9, 2018"
                : "May–August 2018"
            : time}
        </span>
      }
      inset={
        <>
          {footage && !panel.map && <KilaueaFootage />}
          {comparing && split > 0 && split < 100 && (
            <div className="kilauea-coast-labels" aria-hidden="true">
              <span>Before eruption</span>
              <span>Aug 9, 2018</span>
            </div>
          )}
        </>
      }
      sources={
        <>
          <a href="https://doi.org/10.5066/P9S7UQKQ" target="_blank" rel="noreferrer">
            USGS lava maps
          </a>
          <a
            href="https://www.usgs.gov/media/videos/kilauea-volcano-lava-entering-kapoho-bay"
            target="_blank"
            rel="noreferrer"
          >
            USGS ocean-entry footage
          </a>
        </>
      }
    >
      <div
        className="kilauea-narrative"
        data-kilauea-phase={comparing ? "compare" : invited ? "intro" : "replay"}
      >
        <h3>{title}</h3>
        <p className="observation-note">
          {comparing
            ? "The dashed line marks Kapoho Bay’s former shore. Light amber shows the new land."
            : invited
              ? "Follow the mapped lava from Fissure 8 to Kapoho Bay on the shared globe."
              : "Amber highlights the newly mapped lava. Darker orange shows earlier flows."}
        </p>
        <div className="observatory-actions kilauea-actions">
          {invited && (
            <button type="button" className="kilauea-follow" onClick={follow}>
              Follow the lava
            </button>
          )}
          {comparing ? (
            <>
              <button
                type="button"
                disabled={kept}
                className="kilauea-follow"
                onClick={() => {
                  const visit = navigation?.current();
                  if (visit) navigation?.library.save(visit);
                }}
              >
                {kept ? "Comparison kept" : "Keep this comparison"}
              </button>
              <button type="button" onClick={() => inspect(replayIndex.current)}>
                Back to replay
              </button>
            </>
          ) : (
            <button type="button" onClick={compare}>
              Compare coast
            </button>
          )}
        </div>
        {comparing && navigation?.library.notice && (
          <p className="observation-note" role="status">
            {navigation.library.notice}
          </p>
        )}
        {index === OCEAN_ENTRY && !panel.map && !comparing && (
          <div className="observatory-actions">
            <button
              type="button"
              aria-pressed={footage}
              onClick={() => {
                setPlaying(false);
                setFootage(!footage);
              }}
            >
              {footage ? "Return to lava map" : "Watch USGS overflight"}
            </button>
          </div>
        )}
        {status === "failed" && (
          <p className="observation-note" role="status">
            Shaded relief is unavailable. The mapped outlines are visible.
          </p>
        )}
      </div>
      <StoryDock label="Kīlauea playback">
        <div className="survey-transport" data-comparing={comparing}>
          <div className="story-dock-time">
            <label htmlFor={id}>{comparing ? "Compare before and after" : "Mapped extent date"}</label>
            <span className="story-dock-readout">{comparing ? `${split}%` : time}</span>
          </div>
          <input
            id={id}
            className="scrub-slider"
            type="range"
            min={0}
            max={comparing ? 100 : LAST}
            value={split ?? index}
            aria-valuetext={time}
            onInput={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (comparing) setSplit(next);
              else inspect(next);
            }}
          />
          <div className="story-dock-actions">
            {!invited && (
              <PlaybackButton
                buttonRef={playButton}
                playing={playing}
                ended={comparing || index === LAST}
                onClick={() => {
                  if (matchMedia(MOTION).matches)
                    inspect(comparing || index === LAST ? 0 : Math.min(LAST, index + 1));
                  else follow();
                }}
              />
            )}
            {!comparing && (
              <>
                <button type="button" onClick={() => inspect(0)}>
                  Fissure 8
                </button>
                <button type="button" onClick={() => inspect(OCEAN_ENTRY)}>
                  Ocean entry
                </button>
              </>
            )}
          </div>
        </div>
      </StoryDock>
    </ReplayPanel>
  );
}
