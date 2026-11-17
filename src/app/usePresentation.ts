import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { store } from "./stored";
import type { Presentation } from "./useObservatory";

export function usePresentation(initial: () => Presentation, clearViews: () => void, before: () => void) {
  const [presentation, setPresentation] = useState(initial);
  const focusExplorer = useRef<string | null>(null);
  const exploreIntent = useRef<string | null>(null);
  const changePresentation = useCallback(
    (next: Presentation, animate: boolean, prepare?: () => void, remember = true) => {
      before();
      const update = () => {
        focusExplorer.current =
          remember && animate && next === "explore" ? (exploreIntent.current ?? "view-projection") : null;
        exploreIntent.current = null;
        setPresentation(next);
        clearViews();
        prepare?.();
        if (remember) store("presentation", next);
      };
      if (animate) flushSync(update);
      else update();
    },
    [clearViews, before],
  );
  useEffect(() => {
    if (presentation !== "explore" || !focusExplorer.current) return;
    const intended = document.getElementById(focusExplorer.current);
    focusExplorer.current = null;
    const target = intended?.getClientRects().length ? intended : document.getElementById("show-top-bar");
    target?.focus({ preventScroll: true });
  }, [presentation]);
  const enterExplore = useCallback(() => changePresentation("explore", false), [changePresentation]);
  const enterObserve = useCallback(() => changePresentation("observe", false), [changePresentation]);
  const exploreScene = useCallback(
    (prepare: () => void) => changePresentation("explore", true, prepare),
    [changePresentation],
  );
  const observeScene = useCallback(
    (prepare: () => void) => changePresentation("observe", true, prepare),
    [changePresentation],
  );
  return {
    presentation,
    requestExploreFocus: (target: string) => {
      exploreIntent.current = target;
    },
    changePresentation,
    enterExplore,
    enterObserve,
    exploreScene,
    observeScene,
    restore: (next: Presentation, prepare: () => void) => changePresentation(next, true, prepare, false),
  };
}
