import { useEffect, useState } from "react";
import { useObservationImage } from "../observations/useObservationData";
import { atlasImage } from "./atlasArchive";

export function useShorelineComparison(finished: boolean, at: number) {
  const [pass, replay] = useState(0);
  const [reference, showReference] = useState(false);
  const outline = useObservationImage(finished ? atlasImage("aral-reference.webp") : undefined);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!finished || !outline.element || motion.matches) {
      showReference(false);
      return;
    }
    showReference(true);
    const end = () => showReference(false);
    const timer = window.setTimeout(end, 1400);
    motion.addEventListener("change", end);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener("change", end);
    };
  }, [finished, outline.element, pass]);
  const early = finished && reference && !!outline.element;
  const year = new Date(at).getUTCFullYear();
  return {
    image: early ? outline.element : null,
    labels: finished && (
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
          disabled={outline.status === "loading"}
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
          {early ? "1984–1986 observed shoreline" : `Early shoreline with ${year} water`}
        </span>
      </div>
    ),
  };
}
