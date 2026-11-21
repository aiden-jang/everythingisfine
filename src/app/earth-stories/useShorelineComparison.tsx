import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useObservationImage } from "../observations/useObservationData";
import type { ObservationView } from "../observations/types";
import { atlasImage } from "./atlasArchive";
import type { StoryFrame } from "./types";
import { BasinMarkers, BasinReading, type ShorelineBasin } from "./shorelineBasins";

const noMotion = "(prefers-reduced-motion: reduce)";

export function useShorelineComparison({
  basins,
  finished,
  frame,
  map,
  chapter,
  pause,
  playing,
}: {
  basins: readonly ShorelineBasin[] | undefined;
  finished: boolean;
  frame: Pick<StoryFrame, "at" | "raster" | "basins">;
  map: boolean;
  chapter: string | undefined;
  pause: () => void;
  playing: boolean;
}) {
  const year = new Date(frame.at).getUTCFullYear();
  const separating = !!basins && year === 1989;
  const [registered, register] = useState<ObservationView["comparisonFrame"]>();
  const [basin, setBasin] = useState(() => {
    const value = chapter?.startsWith("basin:") ? chapter.split(":")[1] : undefined;
    return basins?.find(({ id }) => id === value)?.id ?? "";
  });
  const [manualReference, setManualReference] = useState(chapter?.endsWith(":reference") ?? false);
  const [pass, replay] = useState(0);
  const [reveal, showReveal] = useState(false);
  const [holding, hold] = useState(false);
  const lastReveal = useRef<number | null>(null);
  const automatic = !!basins && (finished || (separating && playing));
  const comparing = !!basins && (finished || !!basin || manualReference || (separating && playing));
  const framing = useMemo(() => {
    if (!comparing) return undefined;
    const view = { map, onReady: () => register(view) };
    return view;
  }, [comparing, map]);
  const ready = !!framing && registered === framing;
  const outline = useObservationImage(comparing ? atlasImage("aral-reference.webp") : undefined);
  const select = useCallback(
    (id: string) => {
      pause();
      setBasin(id);
      setManualReference(false);
      if (id)
        requestAnimationFrame(() =>
          document.querySelector(".basin-reading")?.scrollIntoView({ block: "nearest" }),
        );
    },
    [pause],
  );
  const pickMarks = useMemo(
    () => basins && { points: basins, select: (index: number) => select(basins[index]!.id) },
    [basins, select],
  );

  useEffect(() => {
    const motion = matchMedia(noMotion);
    if (!comparing) lastReveal.current = null;
    if ((!automatic && pass === 0) || !ready || !outline.element || motion.matches) {
      showReveal(false);
      return;
    }
    if (lastReveal.current === pass) return;
    lastReveal.current = pass;
    showReveal(true);
    const end = () => showReveal(false);
    const timer = window.setTimeout(end, separating ? 740 : 1400);
    motion.addEventListener("change", end);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener("change", end);
    };
  }, [automatic, comparing, ready, outline.element, pass, separating]);

  const separatingInMotion = separating && playing;
  useEffect(() => {
    if (!separatingInMotion || matchMedia(noMotion).matches) {
      hold(false);
      return;
    }
    hold(true);
    const timer = window.setTimeout(() => hold(false), 1150);
    return () => window.clearTimeout(timer);
  }, [separatingInMotion]);

  const early = ready && !!outline.element && (reveal || manualReference);
  const waterUrl = frame.raster?.url;
  return {
    basin,
    holding,
    comparing,
    chapter:
      basins && (basin || manualReference)
        ? `basin:${basin || "all"}${manualReference ? ":reference" : ""}`
        : "",
    framing,
    pickMarks,
    image: early ? outline.element : null,
    labels: basins && (
      <>
        <BasinMarkers basins={basins} selected={basin} select={select} separating={separating} />
        {ready && (
          <div className="shoreline-labels" aria-hidden="true">
            <span data-observation-anchor="" data-lon="60.975" data-lat="45.925">
              1984–86 shoreline
            </span>
            {!early && (
              <span data-observation-anchor="" data-lon="58.505" data-lat="44.795">
                {year} water
              </span>
            )}
          </div>
        )}
      </>
    ),
    reading: basins && (
      <BasinReading basins={basins} selected={basin} select={select} readings={frame.basins} year={year} />
    ),
    controls: comparing && (
      <div className="shoreline-comparison">
        <button
          type="button"
          disabled={outline.status === "loading" || !ready}
          onClick={() => {
            if (outline.status === "failed") outline.retry();
            else if (early) {
              showReveal(false);
              setManualReference(false);
            } else if (matchMedia(noMotion).matches || basin) setManualReference(true);
            else replay((previous) => previous + 1);
          }}
        >
          {outline.status === "failed"
            ? "Retry comparison"
            : early
              ? `Show ${year} water`
              : "Compare shorelines"}
        </button>
        <span role="status">
          {!ready
            ? "Framing the shoreline…"
            : early
              ? "1984–1986 observed shoreline"
              : `Early shoreline with ${year} water`}
        </span>
        <div className="shoreline-source-images">
          <a href={atlasImage("aral-reference.webp")} target="_blank" rel="noreferrer">
            Open 1984–86 shoreline image
          </a>
          {waterUrl && (
            <a href={waterUrl} target="_blank" rel="noreferrer">
              Open {year} water image
            </a>
          )}
        </div>
      </div>
    ),
  };
}
