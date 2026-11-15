import { useCallback, useRef, useState } from "react";
import type { StoryMoment } from "../observations/storyMoment";
import type { VisitPosition } from "../visitor/library";
import type { FloatDiveView } from "./floatPlayback";
import { floatMoment, readFloatMoment } from "./floatMoment";

export function useFloatView(shared: StoryMoment | undefined, before: () => void) {
  const entry = useRef<VisitPosition["float"]>(readFloatMoment(shared));
  const [view, setView] = useState<FloatDiveView | "opening" | null>(() =>
    entry.current ? "opening" : null,
  );
  const update = useCallback(
    (next: FloatDiveView | null) => setView((active) => (active === null ? null : next)),
    [],
  );
  return {
    entry,
    view,
    setView,
    moment: (): StoryMoment | undefined => {
      if (view === "opening") {
        const resume = entry.current;
        return resume
          ? { id: "float", choice: resume.profile, chapter: String(resume.index), map: false }
          : undefined;
      }
      return view ? floatMoment(view) : undefined;
    },
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
