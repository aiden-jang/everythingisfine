import { useEffect, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useStorySession } from "../observations/StorySession";
import type { SkyCityPreference } from "../tonight/SkyCityPicker";
import { earthStories, type EarthStoryId } from "./catalogue";
import { loadEarthStory } from "./load";
import type { EarthStoryData } from "./types";
import { StoryPlayer } from "./StoryPlayer";
type Props = ReplayProps & { id: EarthStoryId; city: SkyCityPreference };

export function EarthStory(props: Props): JSX.Element {
  const { id, city } = props;
  const { initial } = useStorySession();
  const [choice, setChoice] = useState(
    id === "ozone"
      ? initial?.choice === "2019"
        ? "2019"
        : "2006"
      : id === "water" && ["Northern California", "Central Valley"].includes(initial?.choice ?? "")
        ? initial!.choice!
        : "California",
  );
  const [loaded, setLoaded] = useState<{ data: EarthStoryData; key: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = `${id}:${choice}:${id === "comet" || id === "north" ? city.name : ""}`;
  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadEarthStory(id, choice, city.city)
      .then((data) => {
        if (!data.frames.length) throw new Error("No archive observations");
        if (active) setLoaded({ data, key });
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
        status="Preparing the archive"
        sources={<a href={earthStories[id].url}>{earthStories[id].source}</a>}
      >
        <p role="status">
          {failed ? "The archive could not load." : "Preparing the observations. The globe stays ready."}
        </p>
        {failed && (
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry archive
          </button>
        )}
      </ReplayPanel>
    );
  return (
    <StoryPlayer
      key={loaded.key}
      {...props}
      data={loaded.data}
      choice={choice}
      setChoice={setChoice}
      busy={loaded.key !== key}
      failed={failed}
      retry={() => setRetry((n) => n + 1)}
    />
  );
}
