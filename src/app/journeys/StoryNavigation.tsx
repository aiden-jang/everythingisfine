import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ObservatoryProps } from "../Observatory";
import { searchStories } from "../storyIndex";
import type { StoryId } from "../observations/useObservationDeck";
import { journeys } from "./catalogue";

const Navigation = createContext<{
  active: string | null;
  route: { id: string; step: number } | null;
  unavailable: (id: string) => string | null;
  open: (id: string, trigger?: string) => void;
  start: (id: string) => void;
  step: (index: number) => void;
  finish: () => void;
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
            : tonight.entry.mode
          : sun.active
            ? "sun"
            : props.aurora.run
              ? "aurora"
              : null);
  useEffect(() => {
    if (route && active === null) setRoute(null);
  }, [active, route]);
  const unavailable = (id: string) =>
    !props.ready ? "The globe is still opening." : id === "aurora" ? props.aurora.unavailable : null;
  function navigate(id: string, trigger = "open-observations") {
    const story = searchStories.find((entry) => entry.id === id);
    if (!story || unavailable(id)) return;
    props.onScene(story.scene);
    deck.setTrigger(trigger);
    if (id === "sky" || id === "meteors" || id === "moonfall") tonight.open(id);
    else if (id === "aurora") props.aurora.start();
    else if (id === "sun") sun.toggle();
    else if (id === "radar") props.radar.open();
    else if (id === "float") floatDive.open();
    else deck.open(id as StoryId, trigger);
  }
  return (
    <Navigation.Provider
      value={{
        active,
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
          setRoute({ id, step: 0 });
          navigate(first.id, `journey-${id}`);
        },
        step(index) {
          const next = journeys.find((journey) => journey.id === route?.id)?.steps[index];
          if (!route || !next || unavailable(next.id)) return;
          setRoute({ ...route, step: index });
          navigate(next.id, `journey-${route.id}`);
        },
        finish() {
          setRoute(null);
        },
      }}
    >
      {children}
    </Navigation.Provider>
  );
}
