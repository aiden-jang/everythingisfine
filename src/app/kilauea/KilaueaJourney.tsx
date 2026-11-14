import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { ExperienceEnding } from "../journeys/ExperienceEnding";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ObservationCredit } from "../observations/ObservationCredit";
import type { ObservationRaster, ObservationView } from "../observations/types";
import { useObservationImage } from "../observations/useObservationData";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { drawLavaSurface } from "./drawLava";
import { KilaueaFootage } from "./KilaueaFootage";
import { COAST_COMPARISON, LAST, OCEAN_ENTRY, mapDate, snapshots } from "./lavaTimeline";
import relief from "./relief.webp?url";

import { ShareMoment, useStorySession } from "../observations/StorySession";
import { nearest } from "../../sources/observations/common";

const target = { lon: -154.86504, lat: 19.48196, zoom: 2.4 };
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
const prefersStill = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function KilaueaJourney({
  onView,
  onMap,
  onClose,
  closeLabel,
}: {
  onView: (view: ObservationView) => void;
  onMap: (map: boolean) => void;
  onClose: () => void;
  closeLabel: string;
}): JSX.Element {
  const { initial, remember } = useStorySession();
  const [index, setIndex] = useState(
    initial?.at === undefined
      ? 0
      : snapshots.indexOf(nearest(snapshots, initial.at, (s) => Date.parse(s.at))!),
  );
  const [split, setSplit] = useState<number | null>(
    initial?.chapter === "compare"
      ? Math.max(0, Math.min(100, Number.isFinite(Number(initial.choice)) ? Number(initial.choice) : 50))
      : null,
  );
  const [playing, setPlaying] = useState(() => !initial && !prefersStill());
  const [arrived, setArrived] = useState(false);
  const [map, setMap] = useState(initial?.map ?? false);
  const [footage, setFootage] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [surface] = useState(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1300;
    canvas.height = 1150;
    return canvas;
  });
  const { element, status } = useObservationImage(relief);
  const arrive = useCallback(() => setArrived(true), []);
  const at = snapshots[index]!.at;
  useStoryCompletion(index === LAST && !playing);
  const title =
    split !== null || index === LAST
      ? "A new shoreline"
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
          : `Comparison divider at ${split}%`;

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useObservatoryEscape(onClose);
  useLayoutEffect(() => onMap(map), [map, onMap]);
  useLayoutEffect(() => {
    drawLavaSurface(surface, index, element, split);
    onView({
      capture: !footage || map,
      kind: "observation",
      frame: { at: Date.parse(at), raster },
      target,
      image: null,
      surface,
      lens,
      arrive,
    });
    remember?.({ chapter: split === null ? "" : "compare", choice: String(split ?? "") });
  }, [index, element, split, at, onView, surface, arrive, remember, footage, map]);
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
          setSplit(COAST_COMPARISON);
        }
      }, 1050);
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [playing, arrived, index]);

  function inspect(next: number) {
    setPlaying(false);
    setFootage(false);
    setSplit(null);
    setIndex(next);
  }

  return (
    <>
      <div
        className="observatory-stage"
        data-stage="observation"
        role="group"
        aria-label={`Kīlauea on the ${map ? "map" : "globe"}`}
      >
        {footage && !map && <KilaueaFootage />}
        <div className="stage-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          <span>Lower East Rift Zone</span>
        </div>
        <div className="stage-readout">
          <span>
            {footage && !map
              ? "USGS overflight · June 4, 2018"
              : arrived
                ? title
                : "Approaching Hawaiʻi Island"}
          </span>
          <span>
            {split === null
              ? mapDate(at)
              : split === 0
                ? "Before eruption"
                : split === 100
                  ? "August 9, 2018"
                  : "May–August 2018"}
          </span>
        </div>
      </div>
      <div className="observatory-sidebar">
        <section
          className="observatory-intro observation-panel"
          id="observatory-intro"
          aria-labelledby="kilauea-title"
        >
          <div className="observation-heading">
            <h2 id="kilauea-title">Kīlauea</h2>
            <div className="observatory-actions">
              <button type="button" ref={back} onClick={onClose} aria-label={closeLabel}>
                <span className="observation-back-full">{closeLabel}</span>
                <span className="observation-back-compact">Back</span>
              </button>
            </div>
          </div>
          <p className="observation-note">Follow the 2018 USGS lava maps from Fissure 8 to Kapoho Bay.</p>
          <div className="observatory-actions" role="group" aria-label="Observation projection">
            <button type="button" aria-pressed={!map} onClick={() => setMap(false)}>
              Globe
            </button>
            <button
              type="button"
              aria-pressed={map}
              onClick={() => {
                setFootage(false);
                setMap(true);
              }}
            >
              Map
            </button>
          </div>
          <div className="observation-transport">
            <span>
              <label htmlFor={id}>{split === null ? "Mapped extent date" : "Compare before and after"}</label>{" "}
              · {time}
            </span>

            <input
              id={id}
              className="scrub-slider observation-scrub"
              type="range"
              min={0}
              max={split === null ? LAST : 100}
              value={split ?? index}
              aria-valuetext={time}
              onInput={(e) => {
                const next = e.currentTarget.valueAsNumber;
                if (split === null) inspect(next);
                else setSplit(next);
              }}
            />
            <div className="observatory-actions">
              <PlaybackButton
                playing={playing}
                ended={split !== null || index === LAST}
                onClick={() => {
                  if (!playing && (split !== null || index === LAST)) {
                    setSplit(null);
                    setIndex(0);
                  }
                  setFootage(false);
                  setPlaying(!playing);
                }}
              />
            </div>
          </div>
          <div className="observatory-actions">
            <button type="button" onClick={() => inspect(0)}>
              Fissure 8
            </button>
            <button type="button" onClick={() => inspect(OCEAN_ENTRY)}>
              Ocean entry
            </button>
            <button
              type="button"
              aria-pressed={split !== null}
              onClick={() => {
                inspect(LAST);
                setSplit(split === null ? COAST_COMPARISON : null);
              }}
            >
              Compare coast
            </button>
          </div>
          {index === OCEAN_ENTRY && !map && (
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
          <h3>{title}</h3>
          <p className="observation-note">
            {split !== null || index === LAST
              ? "The dashed line marks the former coast. USGS estimates about 3.5 km² of new land."
              : "Amber highlights the newly mapped lava. Darker orange shows earlier flows."}
          </p>
          {status === "failed" && (
            <p className="observation-note" role="status">
              Shaded relief is unavailable. The mapped outlines are visible.
            </p>
          )}
          <a
            className="observation-source"
            href="https://doi.org/10.5066/P9S7UQKQ"
            target="_blank"
            rel="noreferrer"
          >
            USGS lava maps
          </a>
          <a
            className="observation-source"
            href="https://www.usgs.gov/media/videos/kilauea-volcano-lava-entering-kapoho-bay"
            target="_blank"
            rel="noreferrer"
          >
            Watch the USGS ocean-entry footage
          </a>
          <ShareMoment />
          <ExperienceEnding />
        </section>
        <ObservationCredit />
      </div>
    </>
  );
}
