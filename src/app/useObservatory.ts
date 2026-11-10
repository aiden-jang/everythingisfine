import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Permalink } from "./permalink";
import { stored, store } from "./stored";
import type { Stop } from "./tour";
import type { CutawayFocus } from "../globe/cutaway";
import { subsolarPoint } from "../geo/sun";
import type { AuroraRun } from "../sources/auroraRoute";
import { useObservationDeck, type AfterDarkArchive } from "./observations/useObservationDeck";
import type { ReplayId } from "./observations/replays";
import type { FloatDiveView } from "./float/floatPlayback";
import type { SkyLook, TonightView } from "../geo/tonight";
import { useSkyCity } from "./tonight/SkyCityPicker";
import type { GlobePresentation, TonightPresentation } from "../globe/scenePresentation";
import { national, regionCamera, radarRegions, type RadarView } from "./radar/radarCamera";
import { revealReadings, shiftGlobe } from "./presentationMotion";
import { earthStories, isEarthStory } from "./earth-stories/catalogue";

export type EarthScene = "live" | "depth" | "night";
export type Presentation = "observe" | "explore";

export function initialPresentation(shared: Partial<Permalink>, read = stored): Presentation {
  if (shared.story) return "observe";
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
  const [scene, setScene] = useState<EarthScene>(() =>
    shared.story && isEarthStory(shared.story.id)
      ? earthStories[shared.story.id].scene
      : shared.story?.id === "rupture"
        ? "depth"
        : ["lights", "shadow", "orbit"].includes(shared.story?.id ?? "")
          ? "night"
          : "live",
  );
  const [focus, setFocus] = useState<CutawayFocus | null>(null);
  const [tourStop, setTourStop] = useState<Stop | null>(null);
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState<AuroraRun | null>(null);
  const [sunWatch, setSunWatch] = useState(false);
  const [tonightView, setTonightView] = useState<TonightPresentation | "opening" | null>(null);
  const [skyEntry, setSkyEntry] = useState<{
    mode: "sky" | "meteors" | "moonfall";
    revision: number;
    look?: SkyLook;
    moment?: { city: string; at: number };
  }>({
    mode: "sky",
    revision: 0,
  });
  const skyMemory = useRef<TonightView | null>(null);
  const skyCity = useSkyCity(shared.story?.city);
  const updateSky = useCallback((view: TonightPresentation) => {
    // A shower's selected night must not replace the saved general-sky moment.
    if (!view.moonfall && !view.radiantTrail) skyMemory.current = view;
    setTonightView(view);
  }, []);
  const [floatView, setFloatView] = useState<FloatDiveView | "opening" | null>(null);
  const [radarView, setRadarView] = useState<RadarView | null>(null);
  const observations = useObservationDeck(shared.story);
  const closeObservations = observations.close;
  const radarEntry = useRef<{ region?: string; story?: boolean }>({});
  const radarOrigin = useRef<Presentation>("observe");
  const storyFromExplore = useRef(false);
  const transition = useRef<Animation[]>([]);
  const focusExplorer = useRef(false);
  const changePresentation = useCallback(
    (next: Presentation, animate: boolean, prepare?: () => void, remember = true) => {
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
        setTourStop(null);
        setRun(null);
        setSunWatch(false);
        setRadarView(null);
        setTonightView(null);
        setFloatView(null);
        closeObservations();
        storyFromExplore.current = false;
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
    [closeObservations],
  );
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
  const chooseScene = useCallback(
    (next: EarthScene, at: CutawayFocus | null = null) => {
      setScene(next);
      setFocus(at);
      setTourStop(null);
      setRun(null);
      setSunWatch(false);
      setRadarView(null);
      setTonightView(null);
      setFloatView(null);
      closeObservations();
    },
    [closeObservations],
  );
  const observing = presentation === "observe";
  const night = observing && scene === "night";
  const sunActive = night && sunWatch;
  const tonight = night && tonightView !== null;
  const localSky = tonight && tonightView !== "opening" ? tonightView : null;
  const auroraRun = night && !sunActive && !tonight ? run : null;
  const depth = observing && !observations.entry && (tourStop?.purpose === "depth" || scene === "depth");
  const depthFocus = depth ? (tourStop?.purpose === "depth" ? tourStop : focus) : null;
  return {
    observing,
    presentation,
    scene,
    ready,
    canCapture:
      ready &&
      !sunActive &&
      tonightView !== "opening" &&
      floatView !== "opening" &&
      (!radarView || !!radarView.image) &&
      (!observations.entry ||
        (!!observations.view && observations.view.capture !== false && !observations.view.frame.photograph)),
    localReadings: radarView !== null || tonight || floatView !== null || !!observations.entry,
    observations,
    openRecordedStory(id: ReplayId | "kilauea" | "iceberg", from: string) {
      if (observing) observations.open(id, from);
      else
        changePresentation(
          "observe",
          true,
          () => {
            storyFromExplore.current = true;
            setScene("live");
            observations.open(id, from);
          },
          false,
        );
    },
    closeStory() {
      if (storyFromExplore.current) changePresentation("explore", true, undefined, false);
      else observations.close();
    },
    openAfterDarkArchive(archive: AfterDarkArchive) {
      setRun(null);
      setSunWatch(false);
      observations.open(archive, archive === "lights" ? "open-lights-return" : "open-shadow-chase");
    },
    skyCity,
    viewAt: (observations.view?.frame.timeLabel ? undefined : observations.view?.frame.at) ?? localSky?.at,
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
    tonight: {
      active: tonight,
      view: localSky,
      entry: skyEntry,
      open(mode: "sky" | "meteors" | "moonfall" = "sky") {
        const previous = skyMemory.current;
        setSkyEntry((entry) => ({
          mode,
          revision: entry.revision + 1,
          ...(previous?.city.name === skyCity.name
            ? { look: previous.look, moment: { city: previous.city.name, at: previous.at } }
            : {}),
        }));
        setRun(null);
        setSunWatch(false);
        setTonightView("opening");
      },
      update: updateSky,
      close: () => setTonightView(null),
    },
    floatDive: {
      active: floatView !== null,
      view: floatView === "opening" ? null : floatView,
      open: () => setFloatView("opening"),
      update: setFloatView,
      close: () => setFloatView(null),
    },
    radar: {
      active: radarView !== null,
      view: radarView,
      fromExplore: radarView !== null && radarOrigin.current === "explore",
      entry: radarEntry.current,
      open(region?: string, story = false) {
        radarOrigin.current = presentation;
        radarEntry.current = { ...(region ? { region } : {}), story };
        const open = () => {
          if (story) observations.close();
          setRadarView({
            kind: "radar",
            target: region ? regionCamera(radarRegions.find((r) => r.id === region)) : national,
            image: null,
          });
        };
        if (observing) open();
        else
          changePresentation(
            "observe",
            true,
            () => {
              setScene("live");
              open();
            },
            false,
          );
      },
      close() {
        observations.setMap(false);
        if (radarOrigin.current === "explore") changePresentation("explore", true, undefined, false);
        else {
          setRadarView(null);
          if (radarEntry.current.story) observations.open("atmospheric-river", "open-observations");
        }
      },
      update: setRadarView,
    },
    globe(guided: boolean): GlobePresentation {
      if (observations.entry)
        return (
          observations.view ??
          (observations.entry === "lights" || observations.entry === "shadow" ? "planetarium" : "dayline")
        );
      if (night) return sunActive ? null : (localSky ?? auroraRun ?? "planetarium");
      return observing && scene === "live" && !guided
        ? ((floatView === "opening" ? null : floatView) ?? radarView ?? "dayline")
        : null;
    },
    setTourStop,
  };
}
