import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Permalink } from "./permalink";
import { stored, store } from "./stored";
import type { Stop } from "./tour";
import type { CutawayFocus } from "../globe/cutaway";
import { subsolarPoint } from "../geo/sun";
import type { AuroraRun } from "../sources/auroraRoute";
import type { SkyPresentation } from "../globe/scene";
import { revealReadings, shiftGlobe } from "./presentationMotion";

export type EarthScene = "live" | "depth" | "night";
export type Presentation = "observe" | "explore";

export function initialPresentation(shared: Partial<Permalink>, read = stored): Presentation {
  if (shared.section && !shared.presentation) return "explore";
  if (shared.presentation) return shared.presentation;
  if (shared.event || shared.mark || shared.day || shared.cursor != null || shared.flat !== undefined)
    return "explore";
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
  const [sunWatch, setSunWatch] = useState(false);
  const transition = useRef<Animation[]>([]);
  const focusExplorer = useRef(false);
  const changePresentation = useCallback((next: Presentation, animate: boolean, prepare?: () => void) => {
    const globe = document.querySelector<HTMLElement>(".zone-canvas");
    const from =
      animate && globe?.animate && !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? globe.getBoundingClientRect()
        : null;
    for (const animation of transition.current) animation.cancel();
    transition.current = [];
    const update = () => {
      prepare?.();
      focusExplorer.current = animate && next === "explore";
      setPresentation(next);
      setTourStop(null);
      setRun(null);
      setSunWatch(false);
      store("presentation", next);
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
  }, []);
  useEffect(
    () => () => {
      for (const animation of transition.current) animation.cancel();
    },
    [],
  );
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
  const chooseScene = useCallback((next: EarthScene, at: CutawayFocus | null = null) => {
    setScene(next);
    setFocus(at);
    setTourStop(null);
    setRun(null);
    setSunWatch(false);
  }, []);
  const observing = presentation === "observe";
  const night = observing && scene === "night";
  const sunActive = night && sunWatch;
  const auroraRun = night && !sunActive ? run : null;
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
    sun: {
      active: sunActive,
      toggle() {
        if (!sunActive) setRun(null);
        setSunWatch(!sunActive);
      },
    },
    sky(guided: boolean): SkyPresentation {
      if (night) return sunActive ? null : (auroraRun ?? "planetarium");
      return observing && scene === "live" && !guided ? "dayline" : null;
    },
    setTourStop,
  };
}
