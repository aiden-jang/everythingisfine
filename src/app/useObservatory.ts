import { useCallback, useRef, useState } from "react";
import type { Permalink } from "./permalink";
import { stored } from "./stored";
import type { Stop } from "./tour";
import type { CutawayFocus } from "../globe/cutaway";
import { subsolarPoint } from "../geo/sun";
import type { AuroraRun } from "../sources/auroraRoute";
import { useObservationDeck, type AfterDarkArchive } from "./observations/useObservationDeck";
import type { ReplayId } from "./observations/replays";
import type { FloatDiveView } from "./float/floatPlayback";
import { useSkyView } from "./useSkyView";
import { createFloatPlayback } from "./float/floatPlayback";
import { useSkyCity } from "./tonight/SkyCityPicker";
import type { GlobePresentation } from "../globe/scenePresentation";
import { national, regionCamera, radarRegions, type RadarView } from "./radar/radarCamera";
import { usePresentation } from "./usePresentation";
import { useStoredFlag } from "./useStored";
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
  const checkpoint = useRef<() => void>(() => {});
  const before = useCallback(() => checkpoint.current(), []);
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
  const skyCity = useSkyCity(shared.story?.city);
  const sky = useSkyView(skyCity.name);
  const { view: tonightView, entry: skyEntry, setView: setTonightView, update: updateSky } = sky;
  const [floatView, setFloatView] = useState<FloatDiveView | "opening" | null>(null);
  const [radarView, setRadarView] = useState<RadarView | null>(null);
  const updateFloat = useCallback(
    (next: FloatDiveView | null) => setFloatView((active) => (active === null ? null : next)),
    [],
  );
  const updateRadar = useCallback(
    (next: RadarView | null) => setRadarView((active) => (active === null ? null : next)),
    [],
  );
  const observations = useObservationDeck(shared.story, before);
  const closeObservations = observations.close;
  const radarEntry = useRef<{ region?: string; story?: boolean }>({});
  const radarOrigin = useRef<Presentation>("observe");
  const storyFromExplore = useRef(false);
  const clearViews = useCallback(() => {
    setTourStop(null);
    setRun(null);
    setSunWatch(false);
    setRadarView(null);
    setTonightView(null);
    setFloatView(null);
    closeObservations();
    storyFromExplore.current = false;
  }, [closeObservations, setTonightView]);
  const {
    presentation,
    changePresentation,
    enterExplore,
    enterObserve,
    exploreScene,
    observeScene,
    restore: restorePresentation,
  } = usePresentation(() => initialPresentation(shared), clearViews, before);
  const [browser, setBrowser] = useState({ open: false, home: 0 });
  const browserScroll = useRef(0);
  const sharedView = useRef(shared.lon !== undefined || !!shared.day || shared.cursor != null);
  const [rotation, setRotation] = useStoredFlag("landingRotation", true);
  const chooseScene = useCallback(
    (next: EarthScene, at: CutawayFocus | null = null) => {
      before();
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
    [closeObservations, before, setTonightView],
  );
  const observing = presentation === "observe";
  const night = observing && scene === "night";
  const sunActive = night && sunWatch;
  const tonight = night && tonightView !== null;
  const localSky = tonight && tonightView !== "opening" ? tonightView : null;
  const auroraRun = night && !sunActive && !tonight ? run : null;
  const depth = observing && !observations.entry && (tourStop?.purpose === "depth" || scene === "depth");
  const depthFocus = depth ? (tourStop?.purpose === "depth" ? tourStop : focus) : null;
  const origin = {
    presentation,
    radar: radarOrigin.current,
    entry: radarEntry.current,
    story: storyFromExplore.current,
    shared: sharedView.current,
  };
  const capture = () => ({
    scene,
    focus,
    run,
    sunWatch,
    browser,
    origin,
    sky: sky.capture(),
    deck: observations.capture(),
    float:
      floatView === null || floatView === "opening"
        ? floatView
        : { profile: floatView.profile, source: floatView.source, index: floatView.read().index },
    radar: radarView ? { ...radarView, image: null } : null,
  });
  return {
    observing,
    presentation,
    rotation: { enabled: rotation, set: setRotation },
    browser: {
      ...browser,
      scroll: browserScroll,
      setOpen: (open: boolean) => {
        before();
        setBrowser((value) => ({ ...value, open }));
      },
    },
    checkpoint,
    home(prepare: () => void) {
      before();
      sharedView.current = false;
      browserScroll.current = 0;
      setBrowser((value) => ({ open: false, home: value.home + 1 }));
      observations.setQuery("");
      observeScene(() => {
        chooseScene("live");
        prepare();
      });
    },
    navigation: {
      key: [
        presentation,
        scene,
        browser.open,
        observations.entry ??
          (tonight
            ? skyEntry.mode
            : sunActive
              ? "sun"
              : floatView
                ? "float"
                : radarView
                  ? "radar"
                  : auroraRun
                    ? "aurora"
                    : ""),
      ].join(":"),
      capture,
      restore(saved: ReturnType<typeof capture>) {
        restorePresentation(saved.origin.presentation, () => {
          radarOrigin.current = saved.origin.radar;
          radarEntry.current = saved.origin.entry;
          storyFromExplore.current = saved.origin.story;
          sharedView.current = saved.origin.shared;
          setScene(saved.scene);
          setFocus(saved.focus);
          setTourStop(null);
          setRun(saved.run);
          setSunWatch(saved.sunWatch);
          sky.restore(saved.sky);
          let float: FloatDiveView | "opening" | null = null;
          if (saved.float === "opening") float = "opening";
          else if (saved.float) {
            float = createFloatPlayback(saved.float.profile, false, saved.float.source);
            float.seek(saved.float.index);
          }
          setFloatView(float);
          setRadarView(saved.radar);
          setBrowser(saved.browser);
          observations.restore(saved.deck);
        });
      },
    },
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
    aurora: {
      run: auroraRun,
      setRun: (next: AuroraRun | null) => {
        before();
        setRun(next);
      },
    },
    sun: {
      active: sunActive,
      toggle() {
        before();
        if (!sunActive) setRun(null);
        setSunWatch(!sunActive);
      },
    },
    tonight: {
      active: tonight,
      view: localSky,
      entry: skyEntry,
      open(mode: "sky" | "meteors" | "moonfall" = "sky") {
        before();
        sky.open(mode);
        setRun(null);
        setSunWatch(false);
      },
      update: updateSky,
      close: () => {
        before();
        setTonightView(null);
      },
    },
    floatDive: {
      active: floatView !== null,
      view: floatView === "opening" ? null : floatView,
      open: () => {
        before();
        setFloatView("opening");
      },
      update: updateFloat,
      close: () => {
        before();
        setFloatView(null);
      },
    },
    radar: {
      active: radarView !== null,
      view: radarView,
      fromExplore: radarView !== null && radarOrigin.current === "explore",
      entry: radarEntry.current,
      open(region?: string, story = false) {
        before();
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
        before();
        observations.setMap(false);
        if (radarOrigin.current === "explore") changePresentation("explore", true, undefined, false);
        else {
          setRadarView(null);
          if (radarEntry.current.story) observations.open("atmospheric-river", "open-observations");
        }
      },
      update: updateRadar,
    },
    globe(guided: boolean): GlobePresentation {
      if (observations.entry)
        return (
          observations.view ??
          (observations.entry === "lights" || observations.entry === "shadow" ? "planetarium" : "dayline")
        );
      if (night) return sunActive ? null : (localSky ?? auroraRun ?? "planetarium");
      return observing && scene === "live" && !guided
        ? ((floatView === "opening" ? null : floatView) ??
            radarView ??
            (floatView === "opening" || sharedView.current ? "dayline" : "landing"))
        : null;
    },
    setTourStop,
  };
}
