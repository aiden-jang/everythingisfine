import type { ReactNode } from "react";
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
  if (!visible) return null;
  return (
    <StoryPreview>
      <div
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
              <h3>{all ? "All stories in this selection" : "Start exploring"}</h3>
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
                        {navigation?.unavailable(story.id) ?? story.summary}
                      </small>
                    </div>
                  );
                })}
              </div>
              <button
                className="story-browse-all"
                type="button"
                aria-expanded={all}
                onClick={() => expand(all ? null : key)}
              >
                {all ? "Show selected stories" : `View all ${browseStories(scene, true).length + 1} stories`}
              </button>
            </section>
            <details
              className="story-secondary"
              open={browse.sections.includes("visits")}
              onToggle={(event) => browse.fold("visits", event.currentTarget.open)}
            >
              <summary>Your visits & saved views</summary>
              <VisitShelf />
            </details>
            <details
              className="story-secondary"
              open={browse.sections.includes("journeys")}
              onToggle={(event) => browse.fold("journeys", event.currentTarget.open)}
            >
              <summary>Guided journeys & tours</summary>
              <JourneyPicker />
              {children}
            </details>
            {discoveries && (
              <details
                className="story-secondary"
                open={browse.sections.includes("feeds")}
                onToggle={(event) => browse.fold("feeds", event.currentTarget.open)}
              >
                <summary>From available feeds</summary>
                {discoveries}
              </details>
            )}
            <details
              className="story-secondary"
              open={browse.sections.includes("archives")}
              onToggle={(event) => browse.fold("archives", event.currentTarget.open)}
            >
              <summary>Earthquake & eclipse archives</summary>
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
            </details>
          </>
        )}
      </div>
    </StoryPreview>
  );
}
