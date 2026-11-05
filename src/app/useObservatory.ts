import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Permalink } from "./permalink";
import { stored, store } from "./stored";
import type { Stop } from "./tour";

export type EarthScene = "live" | "depth" | "night";
export type Presentation = "observe" | "explore";

export function initialPresentation(shared: Partial<Permalink>, read = stored): Presentation {
  if (shared.event || shared.mark || shared.day || shared.section || shared.cursor != null) return "explore";
  const saved = read("presentation");
  if (saved === "observe" || saved === "explore") return saved;
  const preferences = [
    "railOpen",
    "head",
    "rail",
    "sheet",
    "flat",
    "ramp",
    "motion",
    "depthSink",
    "slab",
    "figures",
  ];
  return preferences.some((key) => read(key) !== null) ? "explore" : "observe";
}

export function useObservatory(shared: Partial<Permalink>) {
  const [presentation, setPresentation] = useState(() => initialPresentation(shared));
  const [scene, setScene] = useState<EarthScene>("live");
  const [focus, setFocus] = useState<{ lon: number; lat: number } | null>(null);
  const [tourStop, setTourStop] = useState<Stop | null>(null);
  const [ready, setReady] = useState(false);
  const transition = useRef<ViewTransition | null>(null);
  const focusExplorer = useRef(false);
  const changePresentation = useCallback((next: Presentation, animate: boolean) => {
    focusExplorer.current = animate && next === "explore";
    const update = (): void => {
      setPresentation(next);
      setTourStop(null);
      store("presentation", next);
    };
    if (
      !animate ||
      !document.startViewTransition ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      update();
      return;
    }
    transition.current?.skipTransition();
    transition.current = document.startViewTransition(async () => {
      flushSync(update);
      // Let the existing resize observer render the new canvas dimensions before its snapshot.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    void transition.current.ready.catch(() => {});
    void transition.current.finished.catch(() => {});
  }, []);
  useEffect(() => () => transition.current?.skipTransition(), []);
  useEffect(() => {
    if (presentation !== "explore" || !focusExplorer.current) return;
    focusExplorer.current = false;
    document.getElementById("view-projection")?.focus({ preventScroll: true });
  }, [presentation]);
  const enterExplore = useCallback(() => changePresentation("explore", false), [changePresentation]);
  const enterObserve = useCallback(() => changePresentation("observe", false), [changePresentation]);
  const exploreScene = useCallback(() => changePresentation("explore", true), [changePresentation]);
  const observeScene = useCallback(() => changePresentation("observe", true), [changePresentation]);
  const chooseScene = useCallback((next: EarthScene, at: { lon: number; lat: number } | null = null) => {
    setScene(next);
    setFocus(at);
    setTourStop(null);
  }, []);
  const observing = presentation === "observe";
  const depth = observing && (tourStop?.purpose === "depth" || scene === "depth");
  const depthFocus = depth ? (tourStop?.purpose === "depth" ? tourStop : focus) : null;
  return {
    observing,
    presentation,
    scene,
    ready,
    setReady,
    chooseScene,
    enterExplore,
    enterObserve,
    exploreScene,
    observeScene,
    depth,
    depthFocus,
    night: observing && scene === "night",
    setTourStop,
  };
}
