import { RadarStage } from "./RadarStage";
import type { RadarView } from "./radarCamera";
import "./radar.css";

export function RadarLayer({ onView }: { onView: (view: RadarView) => void }): JSX.Element {
  return (
    <section id="radar-layer-controls" className="radar-layer" aria-label="Storm radar playback">
      <RadarStage global layer onView={onView} />
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
