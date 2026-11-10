import { useCallback, useRef, useState } from "react";
import type { EarthStoryId } from "../earth-stories/catalogue";
import type { StoryMoment } from "./storyMoment";
import type { ObservationId } from "./catalogue";
import type { ReplayId } from "./replays";
import type { ObservationView } from "./types";

export type AfterDarkArchive = "lights" | "shadow";
export type StoryId = ObservationId | AfterDarkArchive | ReplayId | EarthStoryId | "kilauea";

export function useObservationDeck(shared?: StoryMoment) {
  const memory = useRef(new Map<string, StoryMoment>(shared ? [[shared.id, shared]] : []));
  const [entry, setEntry] = useState<StoryId | null>((shared?.id as StoryId) ?? null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [view, setView] = useState<ObservationView | null>(null);
  const [map, setMap] = useState(shared?.map ?? false);
  const [horizon, setHorizon] = useState(shared?.chapter === "horizon");
  const [query, setQuery] = useState("");
  const active = useRef(entry);
  active.current = entry;
  const projection = useRef(map);
  projection.current = map;
  const update = useCallback((next: ObservationView | null) => {
    setView(next);
    const id = active.current;
    if (id && next)
      memory.current.set(id, { ...memory.current.get(id), id, map: projection.current, at: next.frame.at });
  }, []);
  const remember = useCallback((part: Partial<StoryMoment>) => {
    const id = active.current;
    if (id) memory.current.set(id, { id, map: projection.current, ...memory.current.get(id), ...part });
  }, []);
  const current = useCallback(() => {
    const id = active.current;
    return id ? { ...memory.current.get(id), id, map: projection.current } : undefined;
  }, []);
  const session = {
    initial: entry ? memory.current.get(entry) : undefined,
    remember,
    current,
    openRelated(next: StoryId) {
      setView(null);
      setMap(memory.current.get(next)?.map ?? false);
      setHorizon(memory.current.get(next)?.chapter === "horizon");
      setEntry(next);
    },
  };

  const close = useCallback(() => {
    const id = active.current;
    if (id) memory.current.set(id, { ...memory.current.get(id), id, map: projection.current });
    setView(null);
    setEntry(null);
    setTrigger(null);
    setMap(false);
    setHorizon(false);
  }, []);
  return {
    entry,
    trigger,
    setTrigger,
    returnTo(fallback: string, closeView: () => void) {
      const origin = trigger;
      closeView();
      setTrigger(null);
      requestAnimationFrame(() => {
        const target = [origin, fallback, "open-observations"]
          .map((id) => (id ? document.getElementById(id) : null))
          .find((element) => element?.getClientRects().length);
        target?.focus({ preventScroll: true });
      });
    },
    view,
    map,
    update,
    setMap,
    horizon,
    session,
    getMoment: current,
    query,
    setQuery,
    setHorizon,
    open(next: StoryId, from: string) {
      setTrigger(from);
      setView(null);
      setMap(memory.current.get(next)?.map ?? false);
      setHorizon(memory.current.get(next)?.chapter === "horizon");
      setEntry(next);
    },
    close,
  };
}
