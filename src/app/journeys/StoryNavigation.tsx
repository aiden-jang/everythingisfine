import { reportAnalytics } from "../../../analytics/browser";
import { useJourneyAnalytics } from "../visitor/useJourneyAnalytics";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ObservatoryProps } from "../Observatory";
import { searchStories } from "../storyIndex";
import type { StoryId } from "../observations/useObservationDeck";
import { journeys } from "./catalogue";
import { useVisitMemory } from "../visitor/useVisitMemory";
import type { Visit } from "../visitor/library";

const Navigation = createContext<{
  active: string | null;
  library: ReturnType<typeof useVisitMemory>["library"];
  current: () => Visit | null;
  resume: (visit: Visit) => void;
  route: { id: string; step: number } | null;
  unavailable: (id: string) => string | null;
  open: (id: string, trigger?: string) => void;
  start: (id: string) => void;
  step: (index: number) => void;
  finish: (complete: boolean) => void;
} | null>(null);

export const useStoryNavigation = () => useContext(Navigation);

export function StoryNavigation({ children, ...props }: ObservatoryProps & { children: ReactNode }) {
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
  }, [active, route]);
  const unavailable = (id: string) =>
    !props.ready ? "The globe is still opening." : id === "aurora" ? props.aurora.unavailable : null;
  function navigate(id: string, trigger = "observatory-scenes", saved?: Visit) {
    const story = searchStories.find((entry) => entry.id === id);
    if (!story || unavailable(id)) return;
    const standalone = ["sky", "meteors", "moonfall", "aurora", "sun", "radar", "float"].includes(id);
    saved ??= memory.library.recent.find((visit) => visit.id === id);
    props.views.navigation.prepareStory(story.scene, !standalone);
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
        open(id, trigger) {
          setRoute(null);
          navigate(id, trigger);
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
