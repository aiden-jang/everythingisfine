import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Permalink } from "./permalink";
import { stored, store } from "./stored";
import type { Stop } from "./tour";
import type { CutawayFocus } from "../globe/cutaway";
import { subsolarPoint } from "../geo/sun";
import type { AuroraRun } from "../sources/auroraRoute";
import type { SkyPresentation } from "../globe/scene";

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

export function earthSceneTarget(
  scene: EarthScene,
  deepest: CutawayFocus | null,
  at: number,
): { scene: EarthScene; focus: CutawayFocus | null; camera: [number, number, number] } {
  if (scene === "depth" && deepest) {
    return { scene, focus: { ...deepest, dive: true }, camera: [deepest.lon, deepest.lat, 1.9] };
  }
  if (scene === "night") {
    const sun = subsolarPoint(at);
    return { scene, focus: null, camera: [sun.lon + 180, -sun.lat, 0.92] };
  }
  return { scene: "live", focus: null, camera: [145, 12, 1] };
}

export function useObservatory(shared: Partial<Permalink>) {
  const [presentation, setPresentation] = useState(() => initialPresentation(shared));
  const [scene, setScene] = useState<EarthScene>("live");
  const [focus, setFocus] = useState<CutawayFocus | null>(null);
  const [tourStop, setTourStop] = useState<Stop | null>(null);
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState<AuroraRun | null>(null);
  const transition = useRef<ViewTransition | null>(null);
  const focusExplorer = useRef(false);
  const changePresentation = useCallback((next: Presentation, animate: boolean) => {
    focusExplorer.current = animate && next === "explore";
    const update = (): void => {
      setPresentation(next);
      setTourStop(null);
      setRun(null);
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
  const chooseScene = useCallback((next: EarthScene, at: CutawayFocus | null = null) => {
    setScene(next);
    setFocus(at);
    setTourStop(null);
    setRun(null);
  }, []);
  const observing = presentation === "observe";
  const night = observing && scene === "night";
  const auroraRun = night ? run : null;
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
    night,
    aurora: { run: auroraRun, setRun },
    sky(guided: boolean): SkyPresentation {
      if (night) return auroraRun ?? "planetarium";
      return observing && scene === "live" && !guided ? "dayline" : null;
    },
    setTourStop,
  };
}
