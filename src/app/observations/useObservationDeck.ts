import { useCallback, useState } from "react";
import type { ObservationId } from "./catalogue";
import type { ReplayId } from "./replays";
import type { ObservationView } from "./types";

export type AfterDarkArchive = "lights" | "shadow";
export type StoryId = ObservationId | AfterDarkArchive | ReplayId | "kilauea";

export function useObservationDeck() {
  const [entry, setEntry] = useState<StoryId | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [view, update] = useState<ObservationView | null>(null);
  const [map, setMap] = useState(false);
  const [horizon, setHorizon] = useState(false);

  const close = useCallback(() => {
    update(null);
    setEntry(null);
    setTrigger(null);
    setMap(false);
    setHorizon(false);
  }, []);
  return {
    entry,
    trigger,
    view,
    map,
    update,
    setMap,
    horizon,
    setHorizon,
    open(next: StoryId, from: string) {
      setTrigger(from);
      update(null);
      setMap(false);
      setHorizon(false);
      setEntry(next);
    },
    close,
  };
}
