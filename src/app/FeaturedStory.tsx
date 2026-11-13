import { useStoryNavigation } from "./journeys/StoryNavigation";
import { StoryThumbnail } from "./StoryThumbnail";
import type { EarthScene } from "./useObservatory";

const featured = {
  live: {
    id: "float",
    title: "Float Dive",
    note: "Argo ocean measurements",
    reason: "Follow a measured profile from the deep Atlantic toward the surface.",
  },
  depth: {
    id: "rupture",
    title: "Rupture Reveal",
    note: "Recorded event · Japan, 2011",
    reason: "See where Tōhoku’s fault moved, then compare the recorded waves.",
  },
  night: {
    id: "moonfall",
    title: "Moonfall",
    note: "Recorded journey · Apollo 17, 1972",
    reason: "Leave the night sky and follow the rover across Taurus–Littrow.",
  },
} as const;
export function FeaturedStory({ scene }: { scene: EarthScene }): JSX.Element {
  const navigation = useStoryNavigation();
  const story = featured[scene];
  const id = `open-featured-${story.id}`;
  return (
    <div className="featured-story">
      <StoryThumbnail id={story.id} />
      <span>
        <button
          id={id}
          type="button"
          disabled={!navigation || !!navigation.unavailable(story.id)}
          onClick={() => navigation?.open(story.id, id)}
          aria-describedby={`${id}-source ${id}-note`}
        >
          <strong>{story.title}</strong>
        </button>
        <small id={`${id}-source`}>{story.note}</small>
        <span id={`${id}-note`}>{story.reason}</span>
        <span className="featured-story-link" aria-hidden="true">
          Open story
        </span>
      </span>
    </div>
  );
}
