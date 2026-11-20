import { useReadingArrival } from "./useReadingArrival";
import { useRef, type ReactNode } from "react";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { ContinueVisit } from "./visitor/ContinueVisit";
import { VisitShelf } from "./visitor/VisitShelf";
import { JourneyPicker } from "./journeys/JourneyPicker";
import { StoryRow } from "./StoryRow";
import type { EarthScene, useObservatory } from "./useObservatory";
import { resetStoryResults, StorySearch } from "./StorySearch";
import { StoryPreview } from "./discovery/StoryPreview";
import { FeaturedStory } from "./FeaturedStory";
import { browseStories, featuredStoryId, storyButtonId } from "./storyBrowse";
import { searchStories } from "./storyIndex";
import { APRIL_ECLIPSE_DAY } from "../geo/aprilEclipse";
import "./stories.css";

type Observatory = ReturnType<typeof useObservatory>;
export function StoriesDrawer({
  scene,
  visible = true,
  ready,
  observations: deck,
  onHistory,
  onPickDate,
  onSelect,
  onDismiss,
  children,
  discoveries,
  filter,
  sceneEntry,
  browse,
}: {
  children: ReactNode;
  discoveries?: ReactNode;
  filter?: ReactNode;
  sceneEntry?: ReactNode;
  browse: Pick<Observatory["browser"], "expanded" | "sections" | "expand" | "fold" | "select">;
  visible?: boolean;
  scene: EarthScene | null;
  ready: boolean;
  observations: Observatory["observations"];
  onHistory: (day: string) => void;
  onPickDate: () => void;
  onSelect: () => void;
  onDismiss: () => void;
}) {
  const navigation = useStoryNavigation();
  const { expanded, expand } = browse;
  const key = scene ?? "all";
  const all = expanded === key;
  const featured = featuredStoryId(scene);
  const recent = all
    ? undefined
    : navigation?.library.recent.find(({ id }) =>
        searchStories.some((story) => story.id === id && (!scene || story.scene === scene)),
      );
  const entries = browseStories(scene, all).filter(({ id }) => id !== recent?.id);
  const featuredRow =
    recent && recent.id !== featured ? searchStories.find(({ id }) => id === featured) : null;
  if (featuredRow) entries.unshift(featuredRow);
  const selectionScroll = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const fullHeading = useRef<HTMLHeadingElement>(null);
  useReadingArrival(results, `${key}:${all}`, "fade");
  const rail = () => container.current?.closest<HTMLElement>("#chrome-rail, #observatory-intro");
  const sections = [
    ["journeys", "Guided journeys"],
    ["archives", "Archives"],
  ] as const;
  if (!visible) return null;
  return (
    <StoryPreview scope={`${key}:${deck.query}`}>
      <div
        ref={container}
        id="stories-panel"
        className="stories-drawer"
        data-full={all || undefined}
        aria-label="Story catalogue"
        role="region"
        onClickCapture={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (deck.query) {
            resetStoryResults(event.currentTarget);
            deck.setQuery("");
            container.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({
              preventScroll: true,
            });
          } else onDismiss();
        }}
      >
        <div className="story-selection-heading">
          <h2 id="story-selection-title" tabIndex={-1}>
            {deck.query.trim()
              ? scene
                ? `Search ${{ live: "Earth", depth: "Below the Surface", night: "After Dark" }[scene]}`
                : "Search all stories"
              : scene
                ? { live: "Earth", depth: "Below the Surface", night: "After Dark" }[scene]
                : "All stories"}
          </h2>
          {scene && !deck.query.trim() && (
            <button
              type="button"
              onClick={() => {
                browse.select(null);
                requestAnimationFrame(() =>
                  document.getElementById("story-selection-title")?.focus({ preventScroll: true }),
                );
              }}
            >
              Show all
            </button>
          )}
        </div>
        <StorySearch
          deck={deck}
          ready={ready}
          scene={scene}
          filter={filter}
          results={results}
          onSearchAll={() => browse.select(null)}
        >
          {deck.query.trim() && browse.sections.includes("visits") && (
            <button
              type="button"
              className="story-library-toggle"
              id="story-library-visits"
              aria-expanded={browse.sections.includes("visits")}
              aria-controls="story-library-panel-visits"
              onClick={() => browse.fold("visits", !browse.sections.includes("visits"))}
            >
              Saved &amp; recent
            </button>
          )}
          <section
            id="story-library-panel-visits"
            className="story-secondary"
            aria-label="Saved and recent stories"
            hidden={!browse.sections.includes("visits")}
          >
            <VisitShelf />
          </section>
          {!deck.query.trim() && (
            <>
              {sceneEntry}
              {!all && (recent ? <ContinueVisit visit={recent} /> : <FeaturedStory scene={scene} />)}
              <section className="stories-group" aria-label={all ? "All stories" : "Selected stories"}>
                <h3 className={all ? undefined : "sr-only"} ref={fullHeading} tabIndex={all ? -1 : undefined}>
                  {all ? "All stories" : "Start exploring"}
                </h3>
                <div>
                  {entries.map((story) => {
                    const id = storyButtonId(story.id);
                    return (
                      <StoryRow
                        key={story.id}
                        story={story}
                        buttonId={id}
                        ready={ready}
                        unavailable={navigation?.unavailable(story.id)}
                        open={() => navigation?.open(story.id, id, !!scene)}
                      />
                    );
                  })}
                </div>
                <div className="story-browse-footer">
                  <button
                    className="story-browse-all"
                    type="button"
                    aria-expanded={all}
                    onClick={() => {
                      if (!all) selectionScroll.current = rail()?.scrollTop ?? 0;
                      expand(all ? null : key);
                      requestAnimationFrame(() => {
                        rail()?.scrollTo({ top: all ? selectionScroll.current : 0 });
                        if (!all) fullHeading.current?.focus({ preventScroll: true });
                      });
                    }}
                  >
                    {all ? "Show highlights" : `View all ${browseStories(scene, true).length} stories`}
                  </button>
                  <button
                    type="button"
                    className="story-library-toggle"
                    id="story-library-visits"
                    aria-expanded={browse.sections.includes("visits")}
                    aria-controls="story-library-panel-visits"
                    onClick={() => browse.fold("visits", !browse.sections.includes("visits"))}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path
                        d="M12 5v15m0-15C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                    Saved &amp; recent
                  </button>
                </div>
              </section>
              {discoveries && (
                <details
                  className="story-today"
                  open={browse.sections.includes("feeds")}
                  onToggle={(event) => browse.fold("feeds", event.currentTarget.open)}
                >
                  <summary>From today’s feeds</summary>
                  {discoveries}
                </details>
              )}
              <button
                type="button"
                className="story-library-toggle"
                aria-expanded={browse.sections.includes("library")}
                aria-controls="story-library"
                onClick={() => browse.fold("library", !browse.sections.includes("library"))}
              >
                Guided journeys &amp; archives
              </button>
              <div id="story-library" className="story-library" hidden={!browse.sections.includes("library")}>
                <div className="story-library-links" aria-label="Story library">
                  {sections.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      id={`story-library-${id}`}
                      aria-expanded={browse.sections.includes(id)}
                      aria-controls={`story-library-panel-${id}`}
                      onClick={() => {
                        browse.fold(id, !browse.sections.includes(id));
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <section
                  id="story-library-panel-journeys"
                  className="story-secondary"
                  aria-labelledby="story-library-journeys"
                  hidden={!browse.sections.includes("journeys")}
                >
                  <JourneyPicker />
                  {children}
                </section>
                <section
                  id="story-library-panel-archives"
                  className="story-secondary"
                  aria-labelledby="story-library-archives"
                  hidden={!browse.sections.includes("archives")}
                >
                  <p>Earthquake and eclipse archives</p>
                  <div className="story-archive-actions">
                    <button type="button" onClick={() => onHistory("2011-03-11")}>
                      Japan, 2011
                    </button>
                    <button type="button" onClick={() => onHistory("2013-05-24")}>
                      Deep beneath Okhotsk
                    </button>
                    <button type="button" onClick={() => onHistory(APRIL_ECLIPSE_DAY)}>
                      Total eclipse, 2024
                    </button>
                    <button type="button" onClick={onPickDate}>
                      Pick a past date
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
        </StorySearch>
      </div>
    </StoryPreview>
  );
}
