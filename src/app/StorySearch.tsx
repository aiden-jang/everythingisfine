import { StoryThumbnail } from "./StoryThumbnail";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { useObservatory } from "./useObservatory";
import { findStories } from "./storyIndex";
import { useStoryNavigation } from "./journeys/StoryNavigation";

type Observatory = ReturnType<typeof useObservatory>;
export function StorySearch({
  deck,
  ready,
  aurora,
}: {
  deck: Observatory["observations"];
  ready: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
}): JSX.Element {
  const navigation = useStoryNavigation();
  const matches = findStories(deck.query);
  return (
    <>
      <label className="story-search">
        <span>Find a story or layer</span>
        <input
          type="search"
          name="story"
          autoComplete="off"
          value={deck.query}
          placeholder="Tonga, comet, 2019…"
          onInput={(e) => deck.setQuery(e.currentTarget.value)}
        />
      </label>
      {deck.query.trim() && (
        <section className="stories-group" aria-label="Search results">
          <p role="status" className="observation-note">
            {matches.length
              ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} across all scenes`
              : "No matching stories. Try a place, year or subject."}
          </p>
          <div>
            {matches.map((story) => (
              <button
                type="button"
                disabled={!ready || (story.id === "aurora" && !!aurora.unavailable)}
                key={story.id}
                id={`search-story-${story.id}`}
                onClick={() => navigation?.open(story.id, `search-story-${story.id}`)}
              >
                <StoryThumbnail id={story.id} />
                <span>{story.title}</span>
                <small>{story.id === "aurora" ? (aurora.unavailable ?? story.summary) : story.summary}</small>
              </button>
            ))}
          </div>
          <button type="button" className="story-search-clear" onClick={() => deck.setQuery("")}>
            Clear search
          </button>
        </section>
      )}
    </>
  );
}
