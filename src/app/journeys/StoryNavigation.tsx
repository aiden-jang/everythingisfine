import { usePanelReturn } from "../usePanelReturn";
import { visitAction, restartVisit } from "../visitor/visitAction";
import { refreshAnnotations } from "../../globe/annotationInput";
import type { StoryPlace } from "../discovery/places";
import { reportAnalytics } from "../../../analytics/browser";
import { useJourneyAnalytics } from "../visitor/useJourneyAnalytics";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ObservatoryProps } from "../Observatory";
import { searchStories } from "../storyIndex";
import { featuredStoryId, storyButtonId } from "../storyBrowse";
import type { StoryId } from "../observations/useObservationDeck";
import { isGlobalRadar } from "../radar/radarCamera";
import { journeys } from "./catalogue";
import { useVisitMemory } from "../visitor/useVisitMemory";
import type { Visit } from "../visitor/library";

const Navigation = createContext<{
  returnLabel: string | undefined;
  hasReturnOrigin: boolean;
  openSkyAt: (city: string, trigger: string) => void;
  openRadar: (at: number | undefined, map: boolean) => void;
  returnToBrowse: () => boolean;
  browse: (focusSearch?: boolean) => void;
  explore: () => void;
  active: string | null;
  library: ReturnType<typeof useVisitMemory>["library"];
  current: () => Visit | null;
  resume: (visit: Visit, trigger?: string, smart?: boolean) => void;
  preview: (place?: StoryPlace, restore?: boolean) => void;
  browsingStories: boolean;
  completed: boolean;
  completion: (id: string, complete: boolean) => void;
  route: { id: string; step: number } | null;
  unavailable: (id: string) => string | null;
  open: (id: string, trigger?: string, keepScene?: boolean) => void;
  start: (id: string) => void;
  tour: () => void;
  step: (index: number) => void;
  finish: (complete: boolean) => void;
} | null>(null);

export const useStoryNavigation = () => useContext(Navigation);

export function StoryNavigation({ children, ...props }: ObservatoryProps & { children: ReactNode }) {
  const panelReturn = usePanelReturn();
  const [completion, setCompletion] = useState<{ id: string; complete: boolean } | null>(null);
  const reportCompletion = useCallback((id: string, complete: boolean) => {
    setCompletion((previous) =>
      previous?.id === id && previous.complete === complete ? previous : { id, complete },
    );
  }, []);
  const previewOrigin = useRef<{
    camera: ReturnType<ObservatoryProps["explorer"]["read"]>;
    flat: boolean;
  } | null>(null);
  const origin = useRef<{
    route: ReturnType<ObservatoryProps["views"]["navigation"]["capture"]>;
    camera: ReturnType<ObservatoryProps["explorer"]["read"]>;
    scroll: number;
    scrollTarget: string;
    flat: boolean;
    label: string;
    trigger: string;
  } | null>(null);
  const [route, setRoute] = useState<{ id: string; step: number } | null>(null);
  const { observations: deck, tonight, sun, floatDive } = props.views;
  const active =
    deck.entry ??
    (floatDive.active
      ? "float"
      : props.radar.active
        ? "radar"
        : tonight.active
          ? tonight.view?.lunarDeparture || tonight.view?.moonfall
            ? "moonfall"
            : tonight.view?.radiantTrail
              ? "meteors"
              : tonight.entry.mode
          : sun.active
            ? "sun"
            : props.aurora.run
              ? "aurora"
              : null);
  useJourneyAnalytics(active);
  const memory = useVisitMemory(props, active, completion?.id === active && completion.complete);
  useEffect(() => {
    if (route && active === null) setRoute(null);
    if (active === null) origin.current = null;
  }, [active, route]);
  const unavailable = (id: string) =>
    !props.ready ? "Story playback needs the globe." : id === "aurora" ? props.aurora.unavailable : null;
  function rememberOrigin(trigger: string) {
    if (active !== null || origin.current) return;
    const scrollTarget = props.views.observing ? "observatory-intro" : "chrome-rail";
    origin.current = {
      route: props.views.navigation.capture(),
      camera: previewOrigin.current?.camera ?? props.explorer.read(),
      scroll: document.getElementById(scrollTarget)?.scrollTop ?? 0,
      scrollTarget,
      flat: previewOrigin.current?.flat ?? props.explorer.flat,
      label: (props.views.observing ? props.views.browser.open : props.views.browser.pane === "stories")
        ? "Back to stories"
        : props.views.observing
          ? "Back to home"
          : "Back to layers",
      trigger,
    };
  }
  function navigate(
    id: string,
    trigger = "observatory-scenes",
    saved?: Visit,
    keepScene = false,
    fresh = false,
  ) {
    const story = searchStories.find((entry) => entry.id === id);
    if (!story || unavailable(id)) return;
    panelReturn.cancel();
    rememberOrigin(trigger);
    previewOrigin.current = null;
    reportCompletion(id, false);
    const standalone = ["sky", "meteors", "moonfall", "aurora", "sun", "radar", "float"].includes(id);
    const resuming = saved !== undefined;
    if (!fresh) saved ??= memory.library.recent.find((visit) => visit.id === id);
    const openReplay = () =>
      deck.open(id as StoryId, trigger, saved?.position.moment ?? (fresh ? null : undefined));
    props.views.navigation.prepareStory(
      keepScene && props.views.observing ? props.scene : story.scene,
      !standalone,
      standalone ? undefined : openReplay,
    );
    if (!standalone) return;
    deck.setTrigger(trigger);
    if (saved?.position.sky) props.views.skyCity.select(saved.position.sky.city);
    if (id === "sky" || id === "meteors" || id === "moonfall")
      tonight.open(id, fresh && id !== "moonfall" ? null : saved?.position.sky);
    else if (id === "aurora") props.aurora.start();
    else if (id === "sun") sun.open(saved?.position.solar);
    else if (id === "radar") {
      const exploring = !props.views.observing && !resuming;
      props.radar.open(
        exploring ? "world" : saved?.position.radar?.region,
        false,
        exploring ? props.explorer.radarAt : saved?.position.radar?.at,
      );
      deck.setMap(exploring ? props.explorer.flat : (saved?.position.radar?.map ?? false));
    } else if (id === "float") {
      const exploring = !props.views.observing && !resuming;
      deck.setMap(exploring || !saved ? props.explorer.flat : (saved.position.float?.map ?? false));
      floatDive.open(saved?.position.float);
    }
  }
  function returnToBrowse() {
    const saved = origin.current;
    if (!saved) {
      if (!active || deck.trigger?.startsWith("event-story-") || deck.trigger?.startsWith("archive-story-"))
        return false;
      const category = props.views.browser.category;
      const full = props.views.browser.expanded === (category ?? "all");
      const focus = !full
        ? `continue-story-${active}`
        : featuredStoryId(category) === active
          ? `open-featured-${active}`
          : storyButtonId(active);
      showCatalogue(false, focus);
      return true;
    }
    origin.current = null;
    props.views.visitCheckpoint.current();
    if (active === "radar" && props.radar.view && isGlobalRadar(props.radar.view.region))
      props.explorer.radarTime(props.radar.view.selectedAt ?? null);
    if (active === "float") floatDive.view?.depart(saved.camera);
    props.views.navigation.restore(saved.route);
    props.explorer.restore(saved.camera, saved.flat);
    setRoute(null);
    panelReturn.restore({
      scrollTarget: saved.scrollTarget,
      scroll: saved.scroll,
      focus: saved.trigger,
      fallback: active ? `continue-story-${active}` : saved.scrollTarget,
    });
    return true;
  }
  function showCatalogue(focusSearch = false, entry?: string) {
    panelReturn.cancel();
    previewOrigin.current = null;
    origin.current = null;
    setRoute(null);
    const focus = focusSearch ? "story-search-input" : (entry ?? "explorer-stories-tab");
    props.views.navigation.requestExploreFocus(focus);
    props.views.browser.show("stories");
    props.onExplore(true);
    panelReturn.restore({
      scrollTarget: "chrome-rail",
      scroll: props.views.browser.scroll.current,
      focus,
      fallback: "explorer-stories-tab",
    });
  }
  const toured = useRef(false);
  const restoreTour = useRef(returnToBrowse);
  restoreTour.current = returnToBrowse;
  useEffect(() => {
    const running = props.tour.at !== null;
    const ended = toured.current && !running;
    toured.current = running;
    if (ended && active === null) restoreTour.current();
  }, [props.tour.at, active]);
  return (
    <Navigation.Provider
      value={{
        active,
        hasReturnOrigin: origin.current !== null,
        completed: completion?.id === active && completion.complete,
        completion: reportCompletion,
        browsingStories: props.views.observing
          ? props.views.browser.open
          : props.views.browser.pane === "stories",
        preview(place, restore = true) {
          if (place) {
            previewOrigin.current ??= { camera: props.explorer.read(), flat: props.explorer.flat };
            refreshAnnotations(place);
          } else if (previewOrigin.current) {
            const saved = previewOrigin.current;
            previewOrigin.current = null;
            if (restore) props.explorer.restore(saved.camera, saved.flat);
          }
        },
        returnLabel:
          origin.current?.label ??
          (active && !deck.trigger?.startsWith("event-story-") && !deck.trigger?.startsWith("archive-story-")
            ? "Back to stories"
            : undefined),
        browse: showCatalogue,
        explore() {
          if (active !== null && origin.current?.route.origin.presentation === "explore" && returnToBrowse())
            return;
          panelReturn.cancel();
          previewOrigin.current = null;
          origin.current = null;
          setRoute(null);
          const pane = props.views.browser.pane;
          const focus = pane === "stories" ? "explorer-stories-tab" : "explorer-layers-tab";
          props.views.navigation.requestExploreFocus(focus);
          props.views.browser.show(pane);
          props.onExplore(true);
        },
        openRadar(at, map) {
          rememberOrigin("open-explorer-radar");
          setRoute(null);
          props.views.navigation.prepareStory("live", false);
          props.radar.open("world", false, at);
          deck.setMap(map);
        },
        returnToBrowse,
        ...memory,
        resume(visit, trigger = "observatory-scenes", smart = false) {
          setRoute(null);
          const action = smart ? visitAction(visit) : "Continue";
          navigate(
            visit.id,
            trigger,
            action === "Continue" ? visit : restartVisit(visit),
            false,
            action !== "Continue",
          );
        },
        route:
          route && journeys.find((journey) => journey.id === route.id)?.steps[route.step]?.id === active
            ? route
            : null,
        unavailable,
        openSkyAt(city, trigger) {
          if (unavailable("sky")) return;
          setRoute(null);
          props.views.skyCity.select(city);
          navigate("sky", trigger, undefined, false, true);
        },
        open(id, trigger, keepScene) {
          setRoute(null);
          navigate(id, trigger, undefined, keepScene);
        },
        start(id) {
          const first = journeys.find((journey) => journey.id === id)?.steps[0];
          if (!first || unavailable(first.id)) return;
          reportAnalytics({ name: "journey_started", journey: id });
          // Explore's synchronous handoff briefly has no active story; record the route afterward.
          navigate(first.id, `journey-${id}`);
          setRoute({ id, step: 0 });
        },
        tour() {
          rememberOrigin("start-story-tour");
          props.tour.start();
        },
        step(index) {
          const next = journeys.find((journey) => journey.id === route?.id)?.steps[index];
          if (!route || !next || unavailable(next.id)) return;
          navigate(next.id, `journey-${route.id}`);
          setRoute({ ...route, step: index });
        },
        finish(complete) {
          if (complete && route) reportAnalytics({ name: "journey_completed", journey: route.id });
          setRoute(null);
        },
      }}
    >
      {children}
    </Navigation.Provider>
  );
}
