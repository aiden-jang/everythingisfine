import { storyObservationTime } from "../layerTime";
import { useContext, useRef } from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { StorySession } from "./StorySession";
import type { StoryMoment } from "./storyMoment";

export function SharedStory({ moment }: { moment?: StoryMoment | undefined } = {}) {
  const session = useContext(StorySession);
  const navigation = useStoryNavigation();
  const initial = useRef(moment ?? session?.initial).current;
  if (!initial || navigation?.hasReturnOrigin) return null;
  const positioned =
    initial.at !== undefined || (initial.id === "float" && initial.choice && initial.chapter);
  const heading = positioned ? "A moment shared with you" : "A story shared with you";
  const explanation =
    initial.id === "tonga" && initial.chapter === "pressure"
      ? "Opened at the shared station minute. Inspect the pressure reading or follow the full story."
      : initial.id === "aral" && initial.at !== undefined
        ? `Opened paused at the ${storyObservationTime("aral", initial.at)} annual water classification. Move through the years to compare.`
        : positioned
          ? "Opened paused at the saved moment. Play to continue, or scrub to explore."
          : "Explore at your own pace. Source dates and coverage are shown in this view.";
  return (
    <aside className="shared-story" aria-label="About this shared view">
      <div className="shared-story-message">
        <strong>{heading}</strong>
        <p>{explanation}</p>
      </div>
      <details className="shared-story-compact">
        <summary>
          {initial.at === undefined ? "Shared view" : storyObservationTime(initial.id, initial.at)}
        </summary>
        <p>{explanation}</p>
      </details>
    </aside>
  );
}
