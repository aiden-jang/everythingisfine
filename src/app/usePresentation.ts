import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { store } from "./stored";
import { revealReadings, shiftGlobe } from "./presentationMotion";
import type { Presentation } from "./useObservatory";

export function usePresentation(initial: () => Presentation, clearViews: () => void, before: () => void) {
  const [presentation, setPresentation] = useState(initial);
  const transition = useRef<Animation[]>([]);
  const focusExplorer = useRef(false);
  const changePresentation = useCallback(
    (next: Presentation, animate: boolean, prepare?: () => void, remember = true) => {
      before();
      const globe = document.querySelector<HTMLElement>(".zone-canvas");
      const from =
        animate &&
        globe?.animate &&
        !document.hidden &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? globe.getBoundingClientRect()
          : null;
      for (const animation of transition.current) animation.cancel();
      transition.current = [];
      const update = () => {
        focusExplorer.current = remember && animate && next === "explore";
        setPresentation(next);
        clearViews();
        prepare?.();
        if (remember) store("presentation", next);
      };
      if (!globe || !from) {
        update();
        return;
      }
      flushSync(update);
      const flight = shiftGlobe(globe, from);
      const readings = revealReadings(
        document.querySelector<HTMLElement>(next === "explore" ? "#chrome-rail" : ".observatory-intro"),
      );
      if (flight) transition.current.push(flight);
      if (readings) transition.current.push(readings);
    },
    [clearViews, before],
  );
  useEffect(() => {
    const stop = () => {
      for (const animation of transition.current) animation.cancel();
      transition.current = [];
    };
    const steer = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("#globe-view")) stop();
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      if (motion.matches) stop();
    };
    document.addEventListener("pointerdown", steer, true);
    document.addEventListener("wheel", steer, { capture: true, passive: true });
    document.addEventListener("keydown", steer, true);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", preference);
    return () => {
      stop();
      document.removeEventListener("pointerdown", steer, true);
      document.removeEventListener("wheel", steer, true);
      document.removeEventListener("keydown", steer, true);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", preference);
    };
  }, []);
  useEffect(() => {
    if (presentation !== "explore" || !focusExplorer.current) return;
    focusExplorer.current = false;
    const projection = document.getElementById("view-projection");
    const target = projection?.getClientRects().length ? projection : document.getElementById("show-top-bar");
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
    changePresentation,
    enterExplore,
    enterObserve,
    exploreScene,
    observeScene,
    restore: (next: Presentation, prepare: () => void) => changePresentation(next, true, prepare, false),
  };
}
