import { useEffect, useRef } from "react";
import { SaveVisit } from "../visitor/VisitShelf";
import { searchStories } from "../storyIndex";
import { journeys } from "./catalogue";
import { recommendStory } from "./recommendation";
import { useStoryNavigation } from "./StoryNavigation";
import "./journeys.css";

export function ExperienceEnding({ id }: { id?: string } = {}) {
  const navigation = useStoryNavigation();
  const details = useRef<HTMLDetailsElement>(null);
  const active = id ?? navigation?.active;
  const completed = navigation?.completed ?? false;
  useEffect(() => {
    if (details.current) details.current.open = completed;
  }, [active, completed, navigation?.route]);
  if (!active || !navigation) return null;
  const route =
    navigation.route &&
    journeys.find((entry) => entry.id === navigation.route?.id)?.steps[navigation.route.step]?.id === active
      ? navigation.route
      : null;
  const journey = journeys.find((entry) => entry.id === route?.id);
  const step = route && journey?.steps[route.step];
  if (route && journey && step) {
    const last = route.step === journey.steps.length - 1;
    const next = journey.steps[route.step + 1];
    const nextTitle = searchStories.find((entry) => entry.id === next?.id)?.title;
    return (
      <>
        <SaveVisit />
        <section className="guided-journey" aria-label="Current journey">
          <h3>
            {journey.title}{" "}
            <span>
              {route.step + 1} of {journey.steps.length}
            </span>
          </h3>
          <p>{step.prompt}</p>
          <p className="journey-context">{step.context}</p>
          {last && <p>{journey.ending}</p>}
          <div className="observatory-actions">
            {route.step > 0 && (
              <button type="button" onClick={() => navigation.step(route.step - 1)}>
                Previous view
              </button>
            )}
            {next && (
              <button
                type="button"
                disabled={!!navigation.unavailable(next.id)}
                onClick={() => navigation.step(route.step + 1)}
              >
                Next: {nextTitle}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                navigation.finish(last);
                requestAnimationFrame(() =>
                  document.querySelector<HTMLElement>(".related-stories summary")?.focus(),
                );
              }}
            >
              {last ? "Finish journey" : "Leave journey"}
            </button>
          </div>
          {next && navigation.unavailable(next.id) && <p role="status">{navigation.unavailable(next.id)}</p>}
          <small>Continue when you’re ready. Each view keeps its own controls and time.</small>
        </section>
      </>
    );
  }
  const next = recommendStory(active, navigation.library.recent, navigation.unavailable);
  const story = searchStories.find((entry) => entry.id === next?.id);
  if (!next || !story) return <SaveVisit />;
  const reason = navigation.unavailable(story.id);
  return (
    <>
      <SaveVisit />
      <details
        ref={details}
        className="related-stories"
        onToggle={() => {
          if (details.current?.open && !completed)
            details.current.scrollIntoView({
              block: "nearest",
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            });
        }}
      >
        <summary>{completed ? "Up next" : "Keep exploring"}</summary>
        <p>{next.reason}</p>
        <button type="button" disabled={!!reason} onClick={() => navigation.open(story.id)}>
          <strong>{story.title}</strong>
          <span>{reason ?? story.summary}</span>
        </button>
      </details>
    </>
  );
}
