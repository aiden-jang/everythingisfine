import { featuredStories } from "./storyCuration";
import { searchStories } from "./storyIndex";
import { StoryPreviewButton } from "./discovery/StoryPreview";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { StoryThumbnail } from "./StoryThumbnail";
import type { EarthScene } from "./useObservatory";

export function FeaturedStory({ scene }: { scene: EarthScene }): JSX.Element {
  const navigation = useStoryNavigation();
  const selection = featuredStories[scene];
  const story = searchStories.find(({ id }) => id === selection.id)!;
  const id = `open-featured-${story.id}`;
  const unavailable = navigation?.unavailable(story.id);
  return (
    <div className="featured-story">
      <StoryThumbnail id={story.id} />
      <span>
        <button
          id={id}
          type="button"
          disabled={!navigation || !!unavailable}
          onClick={() => navigation?.open(story.id, id)}
          aria-describedby={`${id}-source ${id}-note`}
        >
          <strong>{story.title}</strong>
        </button>
        <small id={`${id}-source`}>{selection.note}</small>
        <span id={`${id}-note`}>{unavailable ?? selection.reason}</span>
        <span className="featured-story-link" aria-hidden="true">
          Open story
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M3 10h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
        <StoryPreviewButton id={story.id} title={story.title} />
      </span>
    </div>
  );
}
