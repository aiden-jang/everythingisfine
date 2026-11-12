import { searchStories } from "./storyIndex";
import { StoryThumbnail } from "./StoryThumbnail";
import { useStoryNavigation } from "./journeys/StoryNavigation";

const groups = [
  { scene: "live", title: "Live Earth" },
  { scene: "depth", title: "Below the Surface" },
  { scene: "night", title: "After Dark" },
] as const;
const first = ["radar", "float", "sky", "sun", "aurora", "rupture"];

export function OverviewStories(): JSX.Element {
  const navigation = useStoryNavigation();
  return (
    <>
      <p className="observation-note">All scenes. Choose one above to focus, or open a view below.</p>
      {groups.map(({ scene, title }) => (
        <section className="stories-group" aria-label={title} key={scene}>
          <h3>{title}</h3>
          <div>
            {searchStories
              .filter((story) => story.scene === scene)
              .sort((a, b) => {
                const priority = (id: string) => (first.includes(id) ? first.indexOf(id) : first.length);
                return priority(a.id) - priority(b.id);
              })
              .map((story) => {
                const id = `overview-story-${story.id}`;
                return (
                  <button
                    type="button"
                    key={id}
                    id={id}
                    aria-label={story.title}
                    aria-describedby={`${id}-note`}
                    disabled={!navigation || !!navigation.unavailable(story.id)}
                    onClick={() => navigation?.open(story.id, id)}
                  >
                    <StoryThumbnail id={story.id} />
                    <span>{story.title}</span>
                    <small id={`${id}-note`}>{story.summary}</small>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </>
  );
}
