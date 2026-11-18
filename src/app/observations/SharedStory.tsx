import { useContext, useRef } from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { StorySession } from "./StorySession";
import type { StoryMoment } from "./storyMoment";

export function SharedStory({ moment }: { moment?: StoryMoment } = {}) {
  const session = useContext(StorySession);
  const navigation = useStoryNavigation();
  const initial = useRef(moment ?? session?.initial).current;
  if (!initial || navigation?.hasReturnOrigin) return null;
  const positioned =
    initial.at !== undefined || (initial.id === "float" && initial.choice && initial.chapter);
  return (
    <aside className="shared-story" aria-label="About this shared view">
      <strong>{positioned ? "A moment shared with you" : "A story shared with you"}</strong>
      <p>
        {positioned
          ? "Opened paused at the saved moment. Play to continue, or scrub to explore."
          : "Explore at your own pace. Source dates and coverage are shown in this view."}
      </p>
    </aside>
  );
}
