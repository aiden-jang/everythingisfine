import { useCallback, useRef, useState } from "react";
import type { RadarView } from "./radarCamera";

export function useRadarPresentation() {
  const [view, set] = useState<RadarView | null>(null);
  const ready = useRef(false);
  const setView = useCallback((next: RadarView | null) => {
    ready.current = !!next?.image;
    set(next);
  }, []);
  const update = useCallback((next: RadarView | null) => {
    if (next?.image) ready.current = true;
    set((active) => (active === null ? null : next));
  }, []);
  // A later missing scan must not send an already framed radar view back home.
  return { view, setView, update, opening: view !== null && !ready.current };
}
