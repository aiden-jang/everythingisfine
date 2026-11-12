import { RadarStage } from "./RadarStage";
import type { RadarView } from "./radarCamera";
import "./radar.css";
import { useCallback } from "react";

export function RadarLayer({
  onView,
  initialAt,
  onSelect,
}: {
  onView: (view: RadarView) => void;
  initialAt: number | null;
  onSelect: (id: "radar", at: number | null) => void;
}): JSX.Element {
  const select = useCallback((at: number | null) => onSelect("radar", at), [onSelect]);
  return (
    <section id="radar-layer-controls" className="radar-layer" aria-label="Storm radar playback">
      <RadarStage global layer onView={onView} initialAt={initialAt ?? undefined} onSelect={select} />
      <p className="radar-layer-note">
        Striped areas have no listed coverage. Blank does not always mean dry.
      </p>
      <details className="radar-coverage">
        <summary>Radar coverage &amp; source</summary>
        <p>
          Observed composites from participating radar networks, not a forecast. Coverage varies by country;
          the mask is approximate and does not report station outages. Frame time is the composite time;
          individual radars can be older. The past two hours are available in ten-minute steps, at regional
          rather than street-level detail. Radar has its own clock, independent of the earthquake timeline.
        </p>
      </details>
    </section>
  );
}
