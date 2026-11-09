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
          <button key={entry} type="button" id={id} onClick={() => onStory(entry, id)}>
            {replays[entry].label}
          </button>
        );
      })}
      <button type="button" id="open-kilauea" onClick={() => onStory("kilauea", "open-kilauea")}>
        Follow Kīlauea’s lava
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
