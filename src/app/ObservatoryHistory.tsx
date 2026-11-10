import { StoryThumbnail } from "./StoryThumbnail";
import { searchStories } from "./storyIndex";
import { APRIL_ECLIPSE_DAY } from "../geo/aprilEclipse";
import { replayIds, replays, type ReplayId } from "./observations/replays";

export function ObservatoryHistory({
  onHistory,
  onPickDate,
  onStory,
}: {
  onHistory: (day: string) => void;
  onPickDate: () => void;
  onStory: (entry: ReplayId | "kilauea", from: string) => void;
}): JSX.Element {
  return (
    <>
      <button type="button" onClick={() => onHistory(replays.rupture.day)}>
        Japan, 2011 ↗
      </button>
      {replayIds.map((entry) => {
        const id = `open-story-${entry}`;
        return (
          <button
            key={entry}
            type="button"
            id={id}
            aria-label={replays[entry].label}
            onClick={() => onStory(entry, id)}
          >
            <StoryThumbnail id={entry} />
            <span>{replays[entry].label}</span>
            <small>{searchStories.find((story) => story.id === entry)?.summary}</small>
          </button>
        );
      })}
      <button
        type="button"
        id="open-kilauea"
        aria-label="Follow Kīlauea’s lava"
        onClick={() => onStory("kilauea", "open-kilauea")}
      >
        <StoryThumbnail id="kilauea" />
        <span>Follow Kīlauea’s lava</span>
        <small>Follow lava from Fissure 8 to Kapoho Bay.</small>
      </button>
      <button type="button" onClick={() => onHistory("2013-05-24")}>
        Deep beneath Okhotsk ↗
      </button>
      <button type="button" onClick={() => onHistory(APRIL_ECLIPSE_DAY)}>
        Total eclipse, 2024 ↗
      </button>
      <button type="button" onClick={onPickDate}>
        Pick a past date
      </button>
    </>
  );
}
