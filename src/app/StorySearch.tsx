import { StoryThumbnail } from "./StoryThumbnail";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { useObservatory, EarthScene } from "./useObservatory";
import type { StoryId } from "./observations/useObservationDeck";
import { findStories, type SearchStory } from "./storyIndex";

type Observatory = ReturnType<typeof useObservatory>;
export function StorySearch({
  deck,
  ready,
  scene,
  onScene,
  tonight,
  sun,
  onRadar,
  onFloat,
  aurora,
}: {
  deck: Observatory["observations"];
  ready: boolean;
  scene: EarthScene;
  onScene: (scene: EarthScene) => void;
  tonight: Observatory["tonight"];
  sun: Observatory["sun"];
  onRadar: () => void;
  onFloat: () => void;
  aurora: ReturnType<typeof useAuroraOverflight>;
}): JSX.Element {
  function open(story: SearchStory) {
    if (scene !== story.scene) onScene(story.scene);
    deck.setTrigger(`search-story-${story.id}`);
    if (story.id === "sky" || story.id === "meteors" || story.id === "moonfall") tonight.open(story.id);
    else if (story.id === "aurora") aurora.start();
    else if (story.id === "sun") sun.toggle();
    else if (story.id === "radar") onRadar();
    else if (story.id === "float") onFloat();
    else deck.open(story.id as StoryId, `search-story-${story.id}`);
  }
  const matches = findStories(deck.query);
  return (
    <>
      <label className="story-search">
        <span>Find a story or layer</span>
        <input
          type="search"
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
                onClick={() => open(story)}
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
