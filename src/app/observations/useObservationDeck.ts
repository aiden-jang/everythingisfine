import { useCallback, useRef, useState } from "react";
import type { EarthStoryId } from "../earth-stories/catalogue";
import type { StoryMoment } from "./storyMoment";
import type { ObservationId } from "./catalogue";
import type { ReplayId } from "./replays";
import type { ObservationView } from "./types";

export type AfterDarkArchive = "lights" | "shadow";
export type StoryId = ObservationId | AfterDarkArchive | ReplayId | EarthStoryId | "kilauea";

export function useObservationDeck(shared?: StoryMoment, before = () => {}) {
  const checkpoint = useRef(before);
  checkpoint.current = before;
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
  const update = useCallback(
    (next: ObservationView | null) => {
      if (active.current !== entry) return;
      setView(next);
      const id = active.current;
      if (id && next)
        memory.current.set(id, { ...memory.current.get(id), id, map: projection.current, at: next.frame.at });
    },
    [entry],
  );
  const remember = useCallback(
    (part: Partial<StoryMoment>) => {
      if (active.current !== entry) return;
      const id = active.current;
      if (id) memory.current.set(id, { id, map: projection.current, ...memory.current.get(id), ...part });
    },
    [entry],
  );
  const current = useCallback(() => {
    const id = active.current;
    return id ? { ...memory.current.get(id), id, map: projection.current } : undefined;
  }, []);
  const session = {
    initial: entry ? memory.current.get(entry) : undefined,
    remember,
    current,
  };

  const close = useCallback(() => {
    checkpoint.current();
    const id = active.current;
    if (id) memory.current.set(id, { ...memory.current.get(id), id, map: projection.current });
    active.current = null;
    setView(null);
    setEntry(null);
    setTrigger(null);
    setMap(false);
    setHorizon(false);
  }, []);
  const snapshot = { entry, trigger, map, horizon, query };
  return {
    entry,
    capture: () => snapshot,
    restore(saved: typeof snapshot) {
      active.current = saved.entry;
      setEntry(saved.entry);
      setTrigger(saved.trigger);
      setMap(saved.map);
      setHorizon(saved.horizon);
      setQuery(saved.query);
      setView(null);
    },
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
      before();
      active.current = next;
      setTrigger(from);
      setView(null);
      setMap(memory.current.get(next)?.map ?? false);
      setHorizon(memory.current.get(next)?.chapter === "horizon");
      setEntry(next);
    },
    close,
  };
}
