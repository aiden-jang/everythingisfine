import { RadarStage } from "./RadarStage";
import type { RadarView } from "./radarCamera";
import "./radar.css";
import { useCallback, type KeyboardEventHandler } from "react";

export function RadarLayer({
  onView,
  initialAt,
  onSelect,
  suspended = false,
  rewind = false,
  hidden = false,
  dock,
}: {
  onView: (view: RadarView) => void;
  initialAt: number | null;
  suspended?: boolean;
  rewind?: boolean;
  hidden?: boolean;
  dock?: KeyboardEventHandler<HTMLElement> | undefined;
  onSelect: (id: "radar", at: number | null) => void;
}): JSX.Element {
  const select = useCallback((at: number | null) => onSelect("radar", at), [onSelect]);
  return (
    <section
      id="radar-layer-controls"
      className="radar-layer"
      aria-label="Storm radar playback"
      hidden={hidden}
    >
      <RadarStage
        global
        layer
        suspended={suspended}
        rewind={rewind}
        dock={dock}
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
