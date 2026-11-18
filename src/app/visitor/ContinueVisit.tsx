import { visitAction } from "./visitAction";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { searchStories } from "../storyIndex";
import type { Visit } from "./library";
import { visitNote } from "./VisitShelf";

export function ContinueVisit({ visit }: { visit: Visit }) {
  const navigation = useStoryNavigation();
  if (!navigation) return null;
  const title = searchStories.find((story) => story.id === visit.id)!.title;
  const kept = navigation.library.saved.find((entry) => entry.id === visit.id && entry.observation);
  const observation = kept?.observation;
  const reason = navigation.unavailable(visit.id);
  const action = visitAction(visit);
  return (
    <button
      type="button"
      id={`continue-story-${visit.id}`}
      className="story-continue"
      disabled={!!reason}
      onClick={() => navigation.resume(kept ?? visit, `continue-story-${visit.id}`, !kept)}
    >
      <span>
        {kept ? "Revisit" : action} {title}
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <small>
        {reason ??
          (observation
            ? `Kept here · ${Math.round(observation.depth).toLocaleString()} m · ${observation.temperature.toFixed(2)} °C`
            : action === "Open latest"
              ? "Latest available data · source times shown inside"
              : action === "Watch again"
                ? "Start again from the beginning"
                : visitNote(visit))}
      </small>
    </button>
  );
}
