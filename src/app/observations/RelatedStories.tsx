import { useContext } from "react";
import { StorySession } from "./StorySession";
import { searchStories } from "../storyIndex";
import type { StoryId } from "./useObservationDeck";

const related: Partial<Record<StoryId, readonly StoryId[]>> = {
  "atmospheric-river": ["rain", "river"],
  reef: ["bloom", "nino"],
  rupture: ["fault", "tsunami"],
  fault: ["rupture"],
  tonga: ["tsunami"],
  katrina: ["lights"],
  lights: ["katrina"],
  megaflash: ["lightning"],
  iceberg: ["ice", "glacier"],
  drifter: ["swell"],
  swell: ["drifter"],
  orbit: ["shadow"],
  shadow: ["orbit"],
};

export function RelatedStories(): JSX.Element | null {
  const session = useContext(StorySession);
  const id = session?.current()?.id as StoryId | undefined;
  const next = id ? related[id] : undefined;
  if (!next?.length || !session?.openRelated) return null;
  return (
    <details className="related-stories">
      <summary>Keep exploring</summary>
      <p>Each view opens its own observations and time period.</p>
      {next.map((key) => {
        const story = searchStories.find((entry) => entry.id === key);
        return story ? (
          <button type="button" key={key} onClick={() => session.openRelated?.(key)}>
            <strong>{story.title}</strong>
            <span>{story.summary}</span>
          </button>
        ) : null;
      })}
    </details>
  );
}
