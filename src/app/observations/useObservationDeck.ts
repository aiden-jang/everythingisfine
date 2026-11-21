import { spanDeg } from "../../geo/sphere";
import { storyPlace, type StoryPlace } from "../discovery/places";
import { useCallback, useRef, useState } from "react";
import type { EarthStoryId } from "../earth-stories/catalogue";
import type { StoryMoment } from "./storyMoment";
import type { ObservationId } from "./catalogue";
import type { ReplayId } from "./replays";
import type { ObservationView } from "./types";

export type AfterDarkArchive = "lights" | "shadow";
export type StoryId = ObservationId | AfterDarkArchive | ReplayId | EarthStoryId | "kilauea";

export function useObservationDeck(
  shared?: StoryMoment,
  before = () => {},
  initialMap = shared?.map ?? false,
) {
  const checkpoint = useRef(before);
  checkpoint.current = before;
  const memory = useRef(new Map<string, StoryMoment>(shared ? [[shared.id, shared]] : []));
  const recipient = useRef(Boolean(shared));
  const [entry, setEntry] = useState<StoryId | null>((shared?.id as StoryId) ?? null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [view, setView] = useState<ObservationView | null>(null);
  const [map, setProjection] = useState(initialMap);
  const queuedProjection = useRef<boolean>();
  const published = useRef<StoryId | null>(null);
  const departure = useRef<StoryPlace>();
  const setMap = useCallback((next: boolean) => {
    queuedProjection.current = undefined;
    setProjection(next);
  }, []);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const active = useRef(entry);
  active.current = entry;
  const projection = useRef(map);
  projection.current = map;
  const update = useCallback(
    (next: ObservationView | null) => {
      if (active.current !== entry) return;
      const map = queuedProjection.current ?? projection.current;
      if (next) {
        pending.current = false;
        published.current = entry;
        if (queuedProjection.current !== undefined) setMap(map);
      }
      setView((previous) =>
        next
          ? { ...next, cameraKey: [entry ?? "observation", next.cameraKey].filter(Boolean).join(":") }
          : pending.current
            ? previous
            : null,
      );
      const id = active.current;
      if (id && next) memory.current.set(id, { ...memory.current.get(id), id, map, at: next.frame.at });
    },
    [entry, setMap],
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
    if (id !== entry) return;
    return id ? { ...memory.current.get(id), id, map: projection.current } : undefined;
  }, [entry]);
  const session = {
    shared: recipient.current,
    departure: departure.current,
    initial: entry ? memory.current.get(entry) : undefined,
    remember,
    current,
  };

  const close = useCallback(() => {
    checkpoint.current();
    const id = active.current;
    if (id) memory.current.set(id, { ...memory.current.get(id), id, map: projection.current });
    pending.current = false;
    published.current = null;
    departure.current = undefined;
    active.current = null;
    setView(null);
    setEntry(null);
    setTrigger(null);
    setMap(false);
  }, [setMap]);
  const snapshot = { entry, trigger, map, query, recipient: recipient.current };
  return {
    entry,
    revision,
    capture: () => snapshot,
    restore(saved: typeof snapshot) {
      recipient.current = saved.recipient;
      pending.current = false;
      departure.current = undefined;
      published.current = null;
      active.current = saved.entry;
      setEntry(saved.entry);
      setTrigger(saved.trigger);
      setMap(saved.map);
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
        const target = [origin, fallback, "observatory-scenes", "browse-stories"]
          .map((id) => (id ? document.getElementById(id) : null))
          .find((element) => element?.getClientRects().length);
        target?.focus({ preventScroll: true });
      });
    },
    view,
    map,
    update,
    setMap,
    session,
    getMoment: current,
    query,
    setQuery,
    open(next: StoryId, from: string, resume?: StoryMoment | null) {
      before();
      recipient.current = false;
      setRevision((value) => value + 1);
      if (resume === null) memory.current.delete(next);
      if (resume?.id === next) memory.current.set(next, resume);
      pending.current = true;
      const fromPlace = published.current ? storyPlace(published.current) : undefined;
      const destination = storyPlace(next);
      departure.current =
        fromPlace &&
        destination &&
        spanDeg(fromPlace.lon, fromPlace.lat, destination.lon, destination.lat) >= 24
          ? fromPlace
          : undefined;
      active.current = next;
      setTrigger(from);
      setView((previous) =>
        previous
          ? {
              kind: "observation",
              ...(previous.cameraKey ? { cameraKey: previous.cameraKey } : {}),
              holdGeography: true,
              target: previous.target,
              frame: { at: previous.frame.at },
              image: null,
              capture: false,
              ...(previous.lens ? { lens: previous.lens } : {}),
            }
          : null,
      );
      const nextMap = memory.current.get(next)?.map ?? projection.current;
      if (view) queuedProjection.current = nextMap;
      else setMap(nextMap);
      setEntry(next);
    },
    close,
  };
}
