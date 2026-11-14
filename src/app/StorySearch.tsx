import { useRef } from "react";
import { StoryPreviewButton } from "./discovery/StoryPreview";
import { storyKind } from "./storyBrowse";
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
  scene,
  onSearchAll,
}: {
  scene: import("./useObservatory").EarthScene | null;
  onSearchAll: () => void;
  deck: Observatory["observations"];
  ready: boolean;
  aurora: ReturnType<typeof useAuroraOverflight>;
}): JSX.Element {
  const navigation = useStoryNavigation();
  const input = useRef<HTMLInputElement>(null);
  const matches = findStories(deck.query, scene);
  const scope = scene
    ? { live: "Live Earth", depth: "Below the Surface", night: "After Dark" }[scene]
    : "all stories";
  return (
    <>
      <label className="story-search explorer-search">
        <span className="sr-only">Find a story</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m15 15 6 6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input
          ref={input}
          type="search"
          name="story"
          autoComplete="off"
          value={deck.query}
          placeholder="Find a story…"
          onInput={(e) => deck.setQuery(e.currentTarget.value)}
        />
      </label>
      {deck.query.trim() && (
        <section className="stories-group" aria-label="Search results">
          <p role="status" className="observation-note">
            {matches.length
              ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} in ${scope}`
              : `No matches in ${scope}. Try a place, year or subject.`}
          </p>
          {scene && (
            <button
              type="button"
              className="story-search-clear"
              onClick={() => {
                onSearchAll();
                input.current?.focus({ preventScroll: true });
              }}
            >
              Search all stories
            </button>
          )}
          <div>
            {matches.map((story) => (
              <div className="story-choice" key={story.id}>
                <StoryThumbnail id={story.id} />
                <button
                  type="button"
                  disabled={!ready || (story.id === "aurora" && !!aurora.unavailable)}
                  id={`search-story-${story.id}`}
                  onClick={() => navigation?.open(story.id, `search-story-${story.id}`)}
                >
                  {story.title}
                </button>
                <small>
                  <span className="story-kind">{storyKind(story.id)}</span>
                  {story.id === "aurora" ? (aurora.unavailable ?? story.summary) : story.summary}
                  <StoryPreviewButton id={story.id} title={story.title} />
                </small>
              </div>
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
