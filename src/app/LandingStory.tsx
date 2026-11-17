import { useRef } from "react";
import type { firstInvitation } from "./storyCuration";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { StoryThumbnail } from "./StoryThumbnail";
import { ContinueVisit } from "./visitor/ContinueVisit";

export function LandingStory(): JSX.Element | null {
  const navigation = useStoryNavigation();
  const intended = useRef<ReturnType<typeof firstInvitation> | null>(null);
  if (!navigation) return null;
  if (navigation.library.recent.length) return <ContinueVisit scene={null} />;
  const story = intended.current ?? navigation.invitation;
  const unavailable = navigation.unavailable(story.id);
  return (
    <button
      type="button"
      id="start-story"
      className="landing-story-entry"
      onFocus={() => {
        intended.current = story;
      }}
      onPointerDown={() => {
        intended.current = story;
      }}
      disabled={!!unavailable}
      onClick={() => navigation.open(story.id, "start-story")}
    >
      <StoryThumbnail id={story.id} />
      <strong>{story.label}</strong>
      <small>{unavailable ?? story.note}</small>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
