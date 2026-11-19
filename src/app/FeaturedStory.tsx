import { catalogueFeature, featuredStories } from "./storyCuration";
import { searchStories } from "./storyIndex";
import { StoryPreviewButton } from "./discovery/StoryPreview";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { StoryThumbnail } from "./StoryThumbnail";
import type { EarthScene } from "./useObservatory";

export function FeaturedStory({ scene }: { scene: EarthScene | null }): JSX.Element {
  const navigation = useStoryNavigation();
  const selection = scene ? featuredStories[scene] : catalogueFeature;
  const story = searchStories.find(({ id }) => id === selection.id)!;
  const id = `open-featured-${story.id}`;
  const unavailable = navigation?.unavailable(story.id);
  return (
    <div className="featured-story" data-feature={selection.id}>
      <div className="featured-story-art">
        <StoryThumbnail id={story.id} />
      </div>
      <span>
        <strong>{story.title}</strong>
        <small id={`${id}-source`}>{selection.note}</small>
        <span id={`${id}-note`}>{unavailable ?? selection.reason}</span>
        <span className="featured-story-actions">
          <button
            className="featured-story-link"
            id={id}
            type="button"
            disabled={!navigation || !!unavailable}
            onClick={() => navigation?.open(story.id, id)}
            aria-label={`Open story: ${story.title}`}
            aria-describedby={`${id}-source ${id}-note`}
          >
            Open story
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <StoryPreviewButton id={story.id} title={story.title} />
        </span>
      </span>
    </div>
  );
}
