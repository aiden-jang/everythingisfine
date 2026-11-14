import { useCallback, useRef, useState } from "react";
import type { VisitPosition } from "./visitor/library";
import type { Permalink } from "./permalink";
import { initialPresentation } from "./observatoryState";
export { initialPresentation, earthSceneTarget } from "./observatoryState";
import type { Stop } from "./tour";
import type { CutawayFocus } from "../globe/cutaway";
import type { AuroraRun } from "../sources/auroraRoute";
import { useObservationDeck, type AfterDarkArchive } from "./observations/useObservationDeck";
import type { ReplayId } from "./observations/replays";
import type { FloatDiveView } from "./float/floatPlayback";
import { useSkyView } from "./useSkyView";
import { createFloatPlayback } from "./float/floatPlayback";
import { useSkyCity } from "./tonight/SkyCityPicker";
import type { GlobePresentation } from "../globe/scenePresentation";
import { radarCamera } from "./radar/radarCamera";
import { useRadarPresentation } from "./radar/useRadarPresentation";
import { usePresentation } from "./usePresentation";
import { useStoredFlag } from "./useStored";
import { earthStories, isEarthStory } from "./earth-stories/catalogue";

export type EarthScene = "live" | "depth" | "night";
export type Presentation = "observe" | "explore";

export function useObservatory(shared: Partial<Permalink>) {
  const checkpoint = useRef<() => void>(() => {});
  const loadingBackdrop = useRef<"dayline" | "planetarium">("dayline");
  const visitCheckpoint = useRef<() => void>(() => {});
  const before = useCallback(() => {
    visitCheckpoint.current();
    checkpoint.current();
  }, []);
  const [scene, setScene] = useState<EarthScene>(() =>
    shared.story && isEarthStory(shared.story.id)
      ? earthStories[shared.story.id].scene
      : shared.story?.id === "rupture"
        ? "depth"
        : ["lights", "shadow", "orbit"].includes(shared.story?.id ?? "")
          ? "night"
          : (shared.scene ?? "live"),
  );
  const [focus, setFocus] = useState<CutawayFocus | null>(null);
  const [tourStop, setTourStop] = useState<Stop | null>(null);
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState<AuroraRun | null>(null);
  const [sunWatch, setSunWatch] = useState(false);
  const skyCity = useSkyCity(shared.story?.city);
  const sky = useSkyView(skyCity.name);
  const { view: tonightView, entry: skyEntry, setView: setTonightView, update: updateSky } = sky;
  const floatEntry = useRef<VisitPosition["float"]>();
  const [floatView, setFloatView] = useState<FloatDiveView | "opening" | null>(null);
  const {
    view: radarView,
    setView: setRadarView,
    update: updateRadar,
    opening: radarOpening,
  } = useRadarPresentation();
  const updateFloat = useCallback(
    (next: FloatDiveView | null) => setFloatView((active) => (active === null ? null : next)),
    [],
  );
  const observations = useObservationDeck(shared.story, before);
  const closeObservations = observations.close;
  const radarEntry = useRef<{ region?: string; story?: boolean; at?: number }>({});
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
  }, [closeObservations, setTonightView, setRadarView]);
  const {
    presentation,
    changePresentation,
    enterExplore,
    enterObserve,
    exploreScene,
    observeScene,
    restore: restorePresentation,
  } = usePresentation(() => initialPresentation(shared), clearViews, before);
  const [browser, setBrowser] = useState({
    open: !!shared.story || !!shared.catalogue,
    home: 0,
    expanded: null as string | null,
    sections: [] as string[],
    pane:
      shared.catalogue && shared.presentation === "explore"
        ? ("stories" as const)
        : ("layers" as "layers" | "stories"),
    category: shared.story ? scene : shared.catalogue === "all" ? null : (shared.catalogue ?? null),
  });
  const browserScroll = useRef(0);
  const sharedView = useRef(shared.lon !== undefined || !!shared.day || shared.cursor != null);
  const [rotation, setRotation] = useStoredFlag("landingRotation", true);
  const chooseScene = useCallback(
    (next: EarthScene, at: CutawayFocus | null = null, keepDeck = false) => {
      before();
      setScene(next);
      setBrowser((value) => ({
        ...value,
        open: true,
        category: value.open && value.category === null ? null : next,
      }));
      setFocus(at);
      setTourStop(null);
      setRun(null);
      setSunWatch(false);
      setRadarView(null);
      setTonightView(null);
      setFloatView(null);
      if (!keepDeck) closeObservations();
    },
    [closeObservations, before, setTonightView, setRadarView],
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
    browsingStories: !observing
      ? browser.pane === "stories"
      : browser.open &&
        !tourStop &&
        !sunActive &&
        !auroraRun &&
        !tonight &&
        !floatView &&
        !radarView &&
        !observations.entry,
    backgroundLayers:
      !observing || (scene === "live" && !depth && !observations.entry && !floatView && !radarView),
    presentation,
    rotation: { enabled: rotation, set: setRotation },
    browser: {
      ...browser,
      scroll: browserScroll,
      expand: (expanded: string | null) => setBrowser((value) => ({ ...value, expanded })),
      fold: (id: string, open: boolean) =>
        setBrowser((value) =>
          value.sections.includes(id) === open
            ? value
            : {
                ...value,
                sections: open ? [...value.sections, id] : value.sections.filter((key) => key !== id),
              },
        ),
      show: (pane: "layers" | "stories") => {
        before();
        setBrowser((value) => ({ ...value, pane }));
      },
      select: (category: EarthScene | null) => {
        before();
        setBrowser((value) => ({ ...value, open: true, category }));
      },
    },
    checkpoint,
    visitCheckpoint,
    home(prepare: () => void, browse = false) {
      before();
      sharedView.current = false;
      browserScroll.current = 0;
      observations.setQuery("");
      observeScene(() => {
        chooseScene("live");
        setBrowser((value) => ({ ...value, open: browse, home: value.home + 1, category: null }));
        prepare();
      });
    },
    navigation: {
      prepareStory: (next: EarthScene, keepDeck: boolean) => {
        loadingBackdrop.current = night ? "planetarium" : "dayline";
        if (observing) chooseScene(next, null, keepDeck);
        else changePresentation("observe", true, () => chooseScene(next, null, keepDeck), false);
      },
      key: [
        presentation,
        observing ? "observe" : browser.pane,
        scene,
        browser.open,
        browser.category ?? "all",
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
          floatEntry.current = undefined;
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
      loadingBackdrop.current = "planetarium";
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
      open(mode: "sky" | "meteors" | "moonfall" = "sky", resume?: VisitPosition["sky"]) {
        before();
        sky.open(mode, resume);
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
      entry: floatEntry.current,
      open: (resume?: VisitPosition["float"]) => {
        before();
        floatEntry.current = resume;
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
      open(region?: string, story = false, at?: number) {
        before();
        radarOrigin.current = presentation;
        radarEntry.current = { ...(region ? { region } : {}), ...(at !== undefined ? { at } : {}), story };
        const open = () => {
          if (story) observations.close();
          setRadarView({
            kind: "radar",
            target: radarCamera(region),
            region: region ?? "world",
            image: null,
            selectedAt: at,
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
          if (radarEntry.current.story) observations.open("atmospheric-river", "observatory-scenes");
        }
      },
      update: updateRadar,
    },
    globe(guided: boolean): GlobePresentation {
      if (observations.entry) return observations.view ?? loadingBackdrop.current;
      if (floatView === "opening" || radarOpening) return loadingBackdrop.current;
      if (night) return sunActive ? null : (localSky ?? auroraRun ?? "planetarium");
      return observing && scene === "live" && !guided
        ? (floatView ?? radarView ?? (sharedView.current ? "dayline" : "landing"))
        : null;
    },
    setTourStop,
  };
}
