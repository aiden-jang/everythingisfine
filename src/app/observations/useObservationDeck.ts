import { useCallback, useState } from "react";
import type { ObservationId } from "./catalogue";
import type { ObservationView } from "./types";

export function useObservationDeck() {
  const [entry, setEntry] = useState<ObservationId | "catalogue" | null>(null);
  const [view, update] = useState<ObservationView | null>(null);
  const [map, setMap] = useState(false);
  const [horizon, setHorizon] = useState(false);

  const close = useCallback(() => {
    update(null);
    setEntry(null);
    setMap(false);
    setHorizon(false);
  }, []);
  return {
    entry,
    view,
    map,
    update,
    setMap,
    horizon,
    setHorizon,
    open(next: NonNullable<typeof entry> = "catalogue") {
      update(null);
      setMap(false);
      setHorizon(false);
      setEntry(next);
    },
    close,
  };
}
