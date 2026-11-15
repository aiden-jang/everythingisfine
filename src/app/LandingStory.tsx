import { useStoryNavigation } from "./journeys/StoryNavigation";
import { ContinueVisit } from "./visitor/ContinueVisit";

export function LandingStory(): JSX.Element | null {
  const navigation = useStoryNavigation();
  if (!navigation) return null;
  if (navigation.library.recent.length) return <ContinueVisit scene={null} />;
  return (
    <button
      type="button"
      id="start-story-float"
      className="landing-story-entry"
      disabled={!!navigation.unavailable("float")}
      onClick={() => navigation.open("float", "start-story-float")}
    >
      <span>{navigation.unavailable("float") ?? "Start with a story"}</span>
      <strong>Follow an ocean float</strong>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
