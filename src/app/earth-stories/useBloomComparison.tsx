import { useMemo, useState } from "react";
import { surveyComparison } from "../observations/surveyComparison";
import { useObservationImage } from "../observations/useObservationData";
import type { StoryFrame } from "./types";

export function useBloomComparison({
  enabled,
  frame,
  primary,
  choice,
  chapter,
  pause,
}: {
  enabled: boolean;
  frame: Pick<StoryFrame, "raster" | "pairedImage">;
  primary: HTMLImageElement | null;
  choice: string;
  chapter: string | undefined;
  pause: () => void;
}) {
  const saved = /^compare:(\d{1,3})$/.exec(chapter ?? "");
  const [comparing, setComparing] = useState(enabled && !!saved);
  const [divider, setDivider] = useState(saved ? Math.min(100, Number(saved[1])) : 50);
  const paired = useObservationImage(comparing ? frame.pairedImage : undefined, "bloom-comparison");
  const exactPrimary =
    primary && frame.raster && primary.src === new URL(frame.raster.url, location.href).href;
  const exactPair = paired.status === "ready" && frame.pairedImage ? paired.element : null;
  const surface = useMemo(() => {
    if (!comparing || !exactPrimary || !primary || !exactPair) return undefined;
    const natural = choice === "Natural color";
    return surveyComparison(natural ? primary : exactPair, natural ? exactPair : primary);
  }, [comparing, exactPrimary, primary, exactPair, choice]);
  return {
    comparing,
    surface,
    status: paired.status,
    divider: divider / 100,
    chapter: comparing ? `compare:${divider}` : "",
    controls: enabled && (
      <div className="bloom-comparison" data-comparing={comparing || undefined}>
        <button
          type="button"
          aria-label={comparing ? "Close imagery comparison" : "Compare satellite views"}
          aria-pressed={comparing}
          onClick={() => {
            pause();
            setComparing(!comparing);
          }}
        >
          <span className="bloom-compare-full">
            {comparing ? "Close comparison" : "Compare satellite views"}
          </span>
          <span className="bloom-compare-compact">{comparing ? "Close" : "Compare images"}</span>
        </button>
        {comparing && (
          <>
            <label htmlFor="bloom-imagery-divider" className="bloom-divider-label">
              <span>Natural color</span>
              <span>Chlorophyll</span>
            </label>
            <input
              id="bloom-imagery-divider"
              className="scrub-slider"
              type="range"
              min={0}
              max={100}
              value={divider}
              aria-label="Satellite imagery divider"
              aria-valuetext={`${divider}% natural color · ${100 - divider}% chlorophyll`}
              onInput={(event) => setDivider(event.currentTarget.valueAsNumber)}
            />
            {paired.status === "loading" && <span role="status">Loading the matching image…</span>}
            {paired.status === "failed" && (
              <span role="status">
                Matching image unavailable.{" "}
                <button type="button" onClick={paired.retry}>
                  Retry matching image
                </button>
              </span>
            )}
            {!frame.pairedImage && <span role="status">Only one view is available for this date.</span>}
          </>
        )}
      </div>
    ),
  };
}
