import { StoryLoading } from "../StoryLoading";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useStorySession } from "../observations/StorySession";
import type { SkyCityPreference } from "../tonight/SkyCityPicker";
import { earthStories, type EarthStoryId } from "./catalogue";
import { loadEarthStory } from "./load";
import type { EarthStoryData } from "./types";
import { StoryPlayer } from "./StoryPlayer";
import { storyChoice, usesCity } from "./storySelection";
import { StoryRecovery } from "./StoryRecovery";
import { StoryChoices } from "./StoryChoices";
import { captureStoryFocus } from "./replacementFocus";
type Props = ReplayProps & { id: EarthStoryId; city: SkyCityPreference; onRadar: () => void };

export function EarthStory(props: Props): JSX.Element {
  const { id, city } = props;
  const { initial } = useStorySession();
  const [choice, setChoice] = useState(() => storyChoice(id, initial?.choice));
  const [loaded, setLoaded] = useState<{ data: EarthStoryData; key: string; choice: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const restoreFocus = useRef<(() => void) | undefined>();
  useLayoutEffect(() => {
    restoreFocus.current?.();
    restoreFocus.current = undefined;
  }, [loaded]);
  const key = `${id}:${choice}:${usesCity(id) ? city.name : ""}`;
  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadEarthStory(id, choice, city.city)
      .then((data) => {
        if (!data.frames.length) throw new Error("No archive observations");
        if (active) {
          restoreFocus.current = captureStoryFocus();
          setLoaded({ data, key, choice });
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id, choice, city.city, key, retry]);
  const reefRecent = id === "reef" && choice === "Recent observations";
  if (!loaded)
    return (
      <ReplayPanel
        {...props}
        title={earthStories[id].title}
        location={earthStories[id].location}
        subtitle={earthStories[id].summary}
        status={
          failed
            ? reefRecent
              ? "Recent reef data unavailable"
              : "Observation source unavailable"
            : "Preparing the observations"
        }
        sources={<a href={earthStories[id].url}>{earthStories[id].source}</a>}
      >
        <StoryChoices id={id} city={city} choice={choice} select={setChoice} />
        {failed ? (
          <StoryRecovery
            reefRecent={reefRecent}
            retry={() => setRetry((n) => n + 1)}
            archive={() => setChoice("2023 archive")}
          />
        ) : (
          <StoryLoading>Preparing the observations. You can still explore the globe.</StoryLoading>
        )}
      </ReplayPanel>
    );
  return (
    <StoryPlayer
      key={id === "apophis" || id === "eclipse" ? id : loaded.key}
      {...props}
      data={loaded.data}
      displayedChoice={loaded.choice}
      choice={choice}
      setChoice={setChoice}
      busy={loaded.key !== key && !failed}
      failed={failed}
      retry={() => setRetry((n) => n + 1)}
    />
  );
}
