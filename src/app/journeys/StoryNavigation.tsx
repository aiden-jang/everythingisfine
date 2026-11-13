import { reportAnalytics } from "../../../analytics/browser";
import { useJourneyAnalytics } from "../visitor/useJourneyAnalytics";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ObservatoryProps } from "../Observatory";
import { searchStories } from "../storyIndex";
import type { StoryId } from "../observations/useObservationDeck";
import { isGlobalRadar } from "../radar/radarCamera";
import { journeys } from "./catalogue";
import { useVisitMemory } from "../visitor/useVisitMemory";
import type { Visit } from "../visitor/library";

const Navigation = createContext<{
  fromExplore: boolean;
  returnLabel: string | undefined;
  openRadar: (at: number | undefined, map: boolean) => void;
  returnToBrowse: () => boolean;
  active: string | null;
  library: ReturnType<typeof useVisitMemory>["library"];
  current: () => Visit | null;
  resume: (visit: Visit) => void;
  route: { id: string; step: number } | null;
  unavailable: (id: string) => string | null;
  open: (id: string, trigger?: string, keepScene?: boolean) => void;
  start: (id: string) => void;
  step: (index: number) => void;
  finish: (complete: boolean) => void;
} | null>(null);

export const useStoryNavigation = () => useContext(Navigation);

export function StoryNavigation({ children, ...props }: ObservatoryProps & { children: ReactNode }) {
  const origin = useRef<{
    route: ReturnType<ObservatoryProps["views"]["navigation"]["capture"]>;
    camera: ReturnType<ObservatoryProps["explorer"]["read"]>;
    scroll: number;
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
          ? tonight.view?.moonfall
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
  const memory = useVisitMemory(props, active);
  useEffect(() => {
    if (route && active === null) setRoute(null);
    if (active === null) origin.current = null;
  }, [active, route]);
  const unavailable = (id: string) =>
    !props.ready ? "The globe is still opening." : id === "aurora" ? props.aurora.unavailable : null;
  function rememberOrigin(trigger: string) {
    if (props.views.observing) return;
    origin.current = {
      route: props.views.navigation.capture(),
      camera: props.explorer.read(),
      scroll: document.getElementById("chrome-rail")?.scrollTop ?? 0,
      trigger,
    };
  }
  function navigate(id: string, trigger = "observatory-scenes", saved?: Visit, keepScene = false) {
    const story = searchStories.find((entry) => entry.id === id);
    if (!story || unavailable(id)) return;
    rememberOrigin(trigger);
    const standalone = ["sky", "meteors", "moonfall", "aurora", "sun", "radar", "float"].includes(id);
    saved ??= memory.library.recent.find((visit) => visit.id === id);
    props.views.navigation.prepareStory(
      keepScene && props.views.observing ? props.scene : story.scene,
      !standalone,
    );
    deck.setTrigger(trigger);
    if (saved?.position.sky) props.views.skyCity.select(saved.position.sky.city);
    if (id === "sky" || id === "meteors" || id === "moonfall") tonight.open(id, saved?.position.sky);
    else if (id === "aurora") props.aurora.start();
    else if (id === "sun") sun.toggle();
    else if (id === "radar") {
      props.radar.open(saved?.position.radar?.region, false, saved?.position.radar?.at);
      deck.setMap(saved?.position.radar?.map ?? false);
    } else if (id === "float") floatDive.open(saved?.position.float);
    else deck.open(id as StoryId, trigger, saved?.position.moment);
  }
  return (
    <Navigation.Provider
      value={{
        active,
        fromExplore: origin.current !== null,
        returnLabel: origin.current
          ? origin.current.route.browser.pane === "stories"
            ? "Back to stories"
            : "Back to radar layer"
          : undefined,
        openRadar(at, map) {
          rememberOrigin("open-explorer-radar");
          setRoute(null);
          props.views.navigation.prepareStory("live", false);
          props.radar.open("world", false, at);
          deck.setMap(map);
        },
        returnToBrowse() {
          const saved = origin.current;
          if (!saved) return false;
          origin.current = null;
          props.views.visitCheckpoint.current();
          if (active === "radar" && props.radar.view && isGlobalRadar(props.radar.view.region))
            props.explorer.radarTime(props.radar.view.at ?? null);
          props.views.navigation.restore(saved.route);
          props.explorer.restore(saved.camera);
          setRoute(null);
          requestAnimationFrame(() => {
            document.getElementById("chrome-rail")?.scrollTo(0, saved.scroll);
            document.getElementById(saved.trigger)?.focus({ preventScroll: true });
          });
          return true;
        },
        ...memory,
        resume(visit) {
          setRoute(null);
          navigate(visit.id, "observatory-scenes", visit);
        },
        route:
          route && journeys.find((journey) => journey.id === route.id)?.steps[route.step]?.id === active
            ? route
            : null,
        unavailable,
        open(id, trigger, keepScene) {
          setRoute(null);
          navigate(id, trigger, undefined, keepScene);
        },
        start(id) {
          const first = journeys.find((journey) => journey.id === id)?.steps[0];
          if (!first || unavailable(first.id)) return;
          reportAnalytics({ name: "journey_started", journey: id });
          setRoute({ id, step: 0 });
          navigate(first.id, `journey-${id}`);
        },
        step(index) {
          const next = journeys.find((journey) => journey.id === route?.id)?.steps[index];
          if (!route || !next || unavailable(next.id)) return;
          setRoute({ ...route, step: index });
          navigate(next.id, `journey-${route.id}`);
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
