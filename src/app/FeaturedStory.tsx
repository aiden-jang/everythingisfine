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
    <button
      id={id}
      type="button"
      className="featured-story"
      disabled={!navigation || !!navigation.unavailable(story.id)}
      onClick={() => navigation?.open(story.id, id)}
      aria-label={story.title}
      aria-describedby={`${id}-note`}
    >
      <StoryThumbnail id={story.id} />
      <span>
        <strong>{story.title}</strong>
        <small>{story.note}</small>
        <span id={`${id}-note`}>{story.reason}</span>
        <span className="featured-story-link">Open story</span>
      </span>
    </button>
  );
}
