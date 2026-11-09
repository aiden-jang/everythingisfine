import { useEffect, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useStorySession } from "../observations/StorySession";
import type { SkyCityPreference } from "../tonight/SkyCityPicker";
import { earthStories, type EarthStoryId } from "./catalogue";
import { loadEarthStory } from "./load";
import type { EarthStoryData } from "./types";
import { StoryPlayer } from "./StoryPlayer";
import { storyChoice, usesCity } from "./storySelection";
import { StoryChoices } from "./StoryChoices";
type Props = ReplayProps & { id: EarthStoryId; city: SkyCityPreference; onRadar: () => void };

export function EarthStory(props: Props): JSX.Element {
  const { id, city } = props;
  const { initial } = useStorySession();
  const [choice, setChoice] = useState(() => storyChoice(id, initial?.choice));
  const [loaded, setLoaded] = useState<{ data: EarthStoryData; key: string; choice: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = `${id}:${choice}:${usesCity(id) ? city.name : ""}`;
  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadEarthStory(id, choice, city.city)
      .then((data) => {
        if (!data.frames.length) throw new Error("No archive observations");
        if (active) setLoaded({ data, key, choice });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id, choice, city.city, key, retry]);
  if (!loaded)
    return (
      <ReplayPanel
        {...props}
        title={earthStories[id].title}
        location={earthStories[id].location}
        subtitle={earthStories[id].summary}
        status="Preparing the observations"
        sources={<a href={earthStories[id].url}>{earthStories[id].source}</a>}
      >
        <StoryChoices id={id} city={city} choice={choice} select={setChoice} />
        <p role="status">
          {failed
            ? "The selected data could not load."
            : "Preparing the observations. The globe stays ready."}
        </p>
        {failed && (
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        )}
      </ReplayPanel>
    );
  return (
    <StoryPlayer
      key={loaded.key}
      {...props}
      data={loaded.data}
      displayedChoice={loaded.choice}
      choice={choice}
      setChoice={setChoice}
      busy={loaded.key !== key}
      failed={failed}
      retry={() => setRetry((n) => n + 1)}
    />
  );
}
