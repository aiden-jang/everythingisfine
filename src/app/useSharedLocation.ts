import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { Feed, FeedSnapshot } from "./feed";
import type { Filters } from "../data/types";
import type { CameraState } from "../globe/controls";
import { encode, type Permalink } from "./permalink";
import { replaceViewLocation } from "./viewLocation";

interface Props {
  feed: Feed;
  filters: Filters;
  selected: string | null;
  ramp: Permalink["ramp"];
  sectionLine: Permalink["section"];
  archive: FeedSnapshot["archive"];
  markId: string | null;
  at: number | null;
  playing: boolean;
  mapOn: boolean;
  presentation: "observe" | "explore";
  getMoment: () => Permalink["story"];
  camera: MutableRefObject<CameraState>;
  lastWritten: MutableRefObject<string>;
}

export function useSharedLocation({
  feed,
  filters,
  selected,
  ramp,
  sectionLine,
  archive,
  markId,
  at,
  playing,
  mapOn,
  presentation,
  getMoment,
  camera,
  lastWritten,
}: Props) {
  const heldCursor = playing ? null : at;
  const sharedCursor = useRef(at);
  sharedCursor.current = at;
  useLayoutEffect(() => {
    /* Never overwrite a hash this app did not write. See ARCHITECTURE.md#srcappusesharedlocationts. */
    const write = (): void => {
      if (window.location.hash !== lastWritten.current) return;
      const pinnedNow = selected ? feed.store.get(selected) : undefined;
      const reading = pinnedNow?.primary;
      const fragment = encode({
        ...camera.current,
        minMagnitude: filters.minMagnitude,
        windowHours: filters.windowMs / 3_600_000,
        sources: [...filters.sources],
        ramp,
        flat: mapOn,
        presentation,
        story: getMoment(),
        event: reading ? `${reading.source}:${reading.id}` : null,
        day: archive ? new Date(archive.from).toISOString().slice(0, 10) : null,
        mark: markId,
        section: sectionLine,
        cursor: sharedCursor.current,
      });
      if (`#${fragment}` !== window.location.hash) replaceViewLocation(`#${fragment}`);
      // Skip no-op writes: the SPA beacon counts each replacement as a page view.
      lastWritten.current = window.location.hash;
    };
    write();
    const timer = window.setInterval(write, 1000);
    return () => window.clearInterval(timer);
  }, [
    filters,
    selected,
    ramp,
    sectionLine,
    archive,
    markId,
    heldCursor,
    mapOn,
    presentation,
    getMoment,
    feed,
    camera,
    lastWritten,
  ]);

  /* Somebody pasting a link into an open tab. A fragment change does not reload, and the permalink is
  read once at module load, so the address bar and the globe would disagree. */
  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash !== lastWritten.current) window.location.reload();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [lastWritten]);
}
