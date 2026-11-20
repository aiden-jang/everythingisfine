import { useRef, type ReactNode, type RefObject } from "react";
import { StoryRow } from "./StoryRow";
import type { useObservatory } from "./useObservatory";
import { findStories } from "./storyIndex";
import { useStoryNavigation } from "./journeys/StoryNavigation";

type Observatory = ReturnType<typeof useObservatory>;

export function resetStoryResults(target: Element) {
  const tools = target.closest(".story-tools");
  if (tools && getComputedStyle(tools).position === "sticky")
    tools.closest("#chrome-rail")?.scrollTo({ top: 0 });
}

export function StorySearch({
  deck,
  ready,
  scene,
  filter,
  onSearchAll,
  results,
  children,
}: {
  filter?: ReactNode;
  scene: import("./useObservatory").EarthScene | null;
  onSearchAll: () => void;
  deck: Observatory["observations"];
  ready: boolean;
  results: RefObject<HTMLDivElement>;
  children: ReactNode;
}): JSX.Element {
  const navigation = useStoryNavigation();
  const input = useRef<HTMLInputElement>(null);
  const matches = findStories(deck.query, scene);
  const scope = scene
    ? { live: "Earth", depth: "Below the Surface", night: "After Dark" }[scene]
    : "all stories";
  const clear = () => {
    if (input.current) resetStoryResults(input.current);
    deck.setQuery("");
    input.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <div className="story-tools">
        <div className="story-search explorer-search">
          <label className="sr-only" htmlFor="story-search-input">
            Find a story
          </label>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m15 15 6 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <input
            ref={input}
            id="story-search-input"
            type="search"
            name="story"
            autoComplete="off"
            value={deck.query}
            placeholder="Find a story…"
            onInput={(e) => {
              resetStoryResults(e.currentTarget);
              deck.setQuery(e.currentTarget.value);
            }}
          />
          {deck.query && (
            <button type="button" className="story-search-reset" aria-label="Clear search" onClick={clear}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          )}
        </div>
        {filter}
      </div>
      <div className="story-results" ref={results}>
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
                  if (input.current) resetStoryResults(input.current);
                  onSearchAll();
                  input.current?.focus({ preventScroll: true });
                }}
              >
                Search all stories
              </button>
            )}
            {!matches.length && !scene && (
              <button type="button" className="story-search-clear" onClick={clear}>
                Reset search
              </button>
            )}
            <div>
              {matches.map((story) => {
                const id = `search-story-${story.id}`;
                return (
                  <StoryRow
                    key={story.id}
                    story={story}
                    buttonId={id}
                    ready={ready}
                    unavailable={navigation?.unavailable(story.id)}
                    open={() => navigation?.open(story.id, id)}
                  />
                );
              })}
            </div>
          </section>
        )}
        {children}
      </div>
    </>
  );
}
