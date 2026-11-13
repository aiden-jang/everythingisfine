import { useReadingArrival } from "./useReadingArrival";
import { useRef, type ReactNode } from "react";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { VisitShelf } from "./visitor/VisitShelf";
import { JourneyPicker } from "./journeys/JourneyPicker";
import { StoryThumbnail } from "./StoryThumbnail";
import type { useAuroraOverflight } from "./useAuroraOverflight";
import type { EarthScene, useObservatory } from "./useObservatory";
import { StorySearch } from "./StorySearch";
import { StoryPreview } from "./discovery/StoryPreview";
import { FeaturedStory } from "./FeaturedStory";
import { browseStories, storyButtonId, storyKind } from "./storyBrowse";
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
  aurora,
  children,
  discoveries,
  browse,
}: {
  children: ReactNode;
  discoveries?: ReactNode;
  browse: Pick<Observatory["browser"], "expanded" | "sections" | "expand" | "fold">;
  visible?: boolean;
  scene: EarthScene | null;
  ready: boolean;
  observations: Observatory["observations"];
  onHistory: (day: string) => void;
  onPickDate: () => void;
  onSelect: () => void;
  onDismiss: () => void;
  aurora: ReturnType<typeof useAuroraOverflight>;
}) {
  const navigation = useStoryNavigation();
  const { expanded, expand } = browse;
  const key = scene ?? "all";
  const all = expanded === key;
  const entries = browseStories(scene, all);
  const selectionScroll = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  useReadingArrival(container, `${key}:${all}`);
  const rail = () => container.current?.closest<HTMLElement>("#chrome-rail, #observatory-intro");
  const sections = [
    ["visits", "Saved & recent"],
    ["journeys", "Guided journeys"],
    ["archives", "Archives"],
    ["feeds", "From feeds"],
  ] as const;
  if (!visible) return null;
  return (
    <StoryPreview>
      <div
        ref={container}
        id="stories-panel"
        className="stories-drawer"
        aria-label="Stories and layers"
        role="region"
        onClickCapture={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (deck.query) deck.setQuery("");
          else onDismiss();
        }}
      >
        <StorySearch deck={deck} ready={ready} aurora={aurora} />
        <p className="story-preview-hint">Hold a story to preview its region.</p>
        {!deck.query.trim() && (
          <>
            <FeaturedStory scene={scene ?? "live"} />
            <section className="stories-group" aria-label={all ? "All stories" : "Selected stories"}>
              <h3 className={all ? undefined : "sr-only"}>
                {all ? "All stories in this selection" : "Start exploring"}
              </h3>
              <div>
                {entries.map((story) => {
                  const id = storyButtonId(story.id);
                  return (
                    <div className="story-choice" key={story.id}>
                      <StoryThumbnail id={story.id} />
                      <button
                        id={id}
                        type="button"
                        aria-describedby={`${id}-note`}
                        disabled={!ready || !!navigation?.unavailable(story.id)}
                        onClick={() => navigation?.open(story.id, id, !!scene)}
                      >
                        {story.title}
                      </button>
                      <small id={`${id}-note`}>
                        <span className="story-kind">{storyKind(story.id)}</span>
                        <span className={!all && !navigation?.unavailable(story.id) ? "sr-only" : undefined}>
                          {navigation?.unavailable(story.id) ?? story.summary}
                        </span>
                      </small>
                      <svg
                        className="story-choice-chevron"
                        viewBox="0 0 16 16"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
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
                    if (all) requestAnimationFrame(() => rail()?.scrollTo({ top: selectionScroll.current }));
                  }}
                >
                  {all
                    ? "Show selected stories"
                    : `View all ${browseStories(scene, true).length + 1} stories`}
                </button>
                <button
                  type="button"
                  className="story-library-toggle"
                  aria-expanded={browse.sections.includes("library")}
                  aria-controls="story-library"
                  onClick={() => browse.fold("library", !browse.sections.includes("library"))}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      d="M12 5v15m0-15C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  Library
                </button>
              </div>
            </section>
            <div id="story-library" className="story-library" hidden={!browse.sections.includes("library")}>
              <div className="story-library-links" aria-label="Story library">
                {sections
                  .filter(([id]) => id !== "feeds" || discoveries)
                  .map(([id, label]) => (
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
                id="story-library-panel-visits"
                className="story-secondary"
                aria-labelledby="story-library-visits"
                hidden={!browse.sections.includes("visits")}
              >
                <VisitShelf />
              </section>
              <section
                id="story-library-panel-journeys"
                className="story-secondary"
                aria-labelledby="story-library-journeys"
                hidden={!browse.sections.includes("journeys")}
              >
                <JourneyPicker />
                {children}
              </section>
              {discoveries && (
                <section
                  id="story-library-panel-feeds"
                  className="story-secondary"
                  aria-labelledby="story-library-feeds"
                  hidden={!browse.sections.includes("feeds")}
                >
                  {discoveries}
                </section>
              )}
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
      </div>
    </StoryPreview>
  );
}
