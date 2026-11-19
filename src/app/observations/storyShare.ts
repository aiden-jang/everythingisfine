import { searchStories } from "../storyIndex";
import { writeStoryMoment, type StoryMoment } from "./storyMoment";

export function storyShare(moment: StoryMoment, href: string) {
  const url = new URL(href);
  const params = new URLSearchParams();
  writeStoryMoment(params, moment);
  url.hash = params.toString();
  const story = searchStories.find(({ id }) => id === moment.id);
  return {
    url: url.href,
    title: `${story?.title ?? "A shared moment"} · meanwhile.`,
    text: story?.summary ?? "Explore this view of Earth, ocean and sky.",
  };
}
