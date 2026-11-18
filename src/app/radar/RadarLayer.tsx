import { RadarStage } from "./RadarStage";
import type { RadarView } from "./radarCamera";
import "./radar.css";
import { useCallback } from "react";

export function RadarLayer({
  onView,
  initialAt,
  onSelect,
  suspended = false,
}: {
  onView: (view: RadarView) => void;
  initialAt: number | null;
  suspended?: boolean;
  onSelect: (id: "radar", at: number | null) => void;
}): JSX.Element {
  const select = useCallback((at: number | null) => onSelect("radar", at), [onSelect]);
  return (
    <section id="radar-layer-controls" className="radar-layer" aria-label="Storm radar playback">
      <RadarStage
        global
        layer
        suspended={suspended}
        onView={onView}
        initialAt={initialAt ?? undefined}
        onSelect={select}
      />
      <p className="radar-layer-note">
        Striped areas have no listed coverage. Blank does not always mean dry.
      </p>
    </section>
  );
}
