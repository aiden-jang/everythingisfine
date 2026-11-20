import { useEffect, useMemo, useRef, useState } from "react";
import { useObservationImage } from "../observations/useObservationData";
import type { ObservationView } from "../observations/types";
import { atlasImage } from "./atlasArchive";

export function useShorelineComparison(finished: boolean, at: number, map: boolean, waterUrl?: string) {
  const [registered, register] = useState<ObservationView["comparisonFrame"]>();
  const framing = useMemo(() => {
    if (!finished) return undefined;
    const frame = { map, onReady: () => register(frame) };
    return frame;
  }, [finished, map]);
  const ready = !!framing && registered === framing;
  const lastReveal = useRef<number | null>(null);
  const [pass, replay] = useState(0);
  const [reference, showReference] = useState(false);
  const outline = useObservationImage(finished ? atlasImage("aral-reference.webp") : undefined);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!finished) lastReveal.current = null;
    if (!ready || !outline.element || motion.matches) {
      showReference(false);
      return;
    }
    if (lastReveal.current === pass) return;
    lastReveal.current = pass;
    showReference(true);
    const end = () => showReference(false);
    const timer = window.setTimeout(end, 1400);
    motion.addEventListener("change", end);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener("change", end);
    };
  }, [finished, ready, outline.element, pass]);
  const early = ready && reference && !!outline.element;
  const year = new Date(at).getUTCFullYear();
  return {
    framing,
    image: early ? outline.element : null,
    labels: ready && (
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
    ),
    controls: finished && (
      <div className="shoreline-comparison">
        <button
          type="button"
          disabled={outline.status === "loading" || !ready}
          onClick={() => {
            if (outline.status === "failed") outline.retry();
            else if (early || matchMedia("(prefers-reduced-motion: reduce)").matches) showReference(!early);
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
