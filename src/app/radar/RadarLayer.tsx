import { RadarStage } from "./RadarStage";
import type { RadarView } from "./radarCamera";
import "./radar.css";
import { useCallback } from "react";

export function RadarLayer({
  onView,
  initialAt,
  onSelect,
  compact = false,
}: {
  onView: (view: RadarView) => void;
  initialAt: number | null;
  compact?: boolean;
  onSelect: (id: "radar", at: number | null) => void;
}): JSX.Element {
  const select = useCallback((at: number | null) => onSelect("radar", at), [onSelect]);
  return (
    <section
      id="radar-layer-controls"
      className="radar-layer"
      data-compact={compact || undefined}
      aria-label="Storm radar playback"
    >
      <RadarStage global layer onView={onView} initialAt={initialAt ?? undefined} onSelect={select} />
      <p className="radar-layer-note">
        Striped areas have no listed coverage. Blank does not always mean dry.
      </p>
    </section>
  );
}
