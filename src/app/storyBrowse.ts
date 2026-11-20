import { catalogueFeature, featuredStories, sceneHighlights, storyRank } from "./storyCuration";
import { observations } from "./observations/catalogue";
import { inStoryTopic, searchStories, type SearchStory } from "./storyIndex";
import type { EarthScene } from "./useObservatory";

export const featuredStoryId = (scene: EarthScene | null) =>
  scene ? featuredStories[scene].id : catalogueFeature.id;

export function browseStories(scene: EarthScene | null, all: boolean): readonly SearchStory[] {
  const featured = featuredStoryId(scene);
  const list = searchStories.filter((story) => inStoryTopic(story, scene));
  if (all) return list.sort((a, b) => storyRank(a.id) - storyRank(b.id));
  const ids = scene ? sceneHighlights[scene] : ["float", "sky", "rupture"];
  return ids.slice(0, 3).flatMap((id) => list.filter((story) => story.id === id && id !== featured));
}
export function storyKind(id: string): string {
  if (["orbit", "sky", "shadow", "meteors", "apophis"].includes(id)) return "Prediction";
  if (["wind", "swell", "atmospheric-river", "aurora"].includes(id)) return "Forecast";
  if (id === "deep") return "Reconstruction";
  if (id === "seafloor") return "Mapped terrain";
  if (id === "float") return "Measured profile";
  if (
    ["radar", "sun", "reef"].includes(id) ||
    observations[id as keyof typeof observations]?.group === "Recent observations"
  )
    return "Recent observations";
  return "Recorded story";
}
export function storyButtonId(id: string): string {
  const aliases: Record<string, string> = {
    radar: "open-storm-radar",
    sky: "open-tonight-sky",
    sun: "open-sun-watch",
    aurora: "open-aurora-overflight",
    deep: "open-deep-time",
    shadow: "open-shadow-chase",
    lights: "open-lights-return",
    meteors: "open-meteor-nights",
    orbit: "open-orbital-pass",
  };
  return aliases[id] ?? `open-story-${id}`;
}
