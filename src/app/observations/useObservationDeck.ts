import { useCallback, useState } from "react";
import type { ObservationId } from "./catalogue";
import type { ObservationView } from "./types";

export type AfterDarkArchive = "lights" | "shadow";

export function useObservationDeck() {
  const [entry, setEntry] = useState<ObservationId | "catalogue" | AfterDarkArchive | null>(null);
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
    open(next: NonNullable<typeof entry> = "catalogue", from?: string) {
      if (from) setTrigger(from);
      update(null);
      setMap(false);
      setHorizon(false);
      setEntry(next);
    },
    close,
  };
}
