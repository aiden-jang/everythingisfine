import { useCallback, useRef, useState } from "react";
import type { StoryMoment } from "../observations/storyMoment";
import type { VisitPosition } from "../visitor/library";
import type { FloatDiveView } from "./floatPlayback";
import { floatNavigationMoment, readFloatMoment } from "./floatMoment";

export function useFloatView(shared: StoryMoment | undefined, before: () => void) {
  const entry = useRef<VisitPosition["float"]>(readFloatMoment(shared));
  const [view, setView] = useState<FloatDiveView | "opening" | null>(() =>
    entry.current ? "opening" : null,
  );
  const update = useCallback((next: FloatDiveView | null, deliberate = false) => {
    if (deliberate) entry.current = undefined;
    setView((active) => (active === null ? null : next));
  }, []);
  return {
    entry,
    view,
    setView,
    moment: (map = false): StoryMoment | undefined => floatNavigationMoment(view, entry.current, map),
    controls: {
      active: view !== null,
      view: view === "opening" ? null : view,
      entry: entry.current,
      update,
      open(resume?: VisitPosition["float"]) {
        before();
        entry.current = resume;
        setView("opening");
      },
      close() {
        before();
        setView(null);
      },
    },
  };
}
