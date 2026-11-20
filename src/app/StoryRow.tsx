import { StoryPreviewButton } from "./discovery/StoryPreview";
import { StoryThumbnail } from "./StoryThumbnail";
import { storyKind } from "./storyBrowse";
import type { SearchStory } from "./storyIndex";

export function StoryRow({
  story,
  buttonId,
  ready,
  unavailable,
  open,
}: {
  story: SearchStory;
  buttonId: string;
  ready: boolean;
  unavailable: string | null | undefined;
  open: () => void;
}): JSX.Element {
  return (
    <div className="story-choice">
      <StoryThumbnail id={story.id} />
      <button
        id={buttonId}
        type="button"
        aria-describedby={`${buttonId}-note`}
        disabled={!ready || !!unavailable}
        onClick={open}
      >
        {story.title}
      </button>
      <small id={`${buttonId}-note`}>
        <span className="story-kind">{storyKind(story.id)}</span>
        <span className="story-promise">{unavailable ?? story.summary}</span>
      </small>
      <div className="story-row-preview">
        <StoryPreviewButton id={story.id} title={story.title} triggerId={buttonId} />
      </div>
      <svg className="story-choice-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
