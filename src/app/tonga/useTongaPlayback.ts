import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryMoment } from "../observations/storyMoment";
import type { Satellite } from "./drawTonga";
import infraredUrl from "./infrared.webp?url";
import vaporUrl from "./water-vapor.webp?url";
import {
  DURATION,
  END,
  ERUPTION,
  START,
  SURVEY_DURATION,
  minuteAt,
  stations,
  timeIso,
} from "./tongaTimeline";

export type TongaStation = (typeof stations)[number];
export interface TongaPlayback {
  elapsed: number;
  playing: boolean;
  anchor?: number;
  station?: TongaStation;
}
const MOTION = "(prefers-reduced-motion: reduce)";
const duration = (view: TongaPlayback) => (view.anchor === undefined ? DURATION : SURVEY_DURATION);
const minuteFor = (view: TongaPlayback) => minuteAt(view.elapsed, view.anchor !== undefined);

function survey(minute: number, station?: TongaStation): TongaPlayback {
  return {
    elapsed: ((minute - START) / (END - START)) * SURVEY_DURATION,
    playing: false,
    anchor: Math.max(410, minute),
    ...(station ? { station } : {}),
  };
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

export function useTongaPlayback(initial: StoryMoment | undefined) {
  const [assets, setAssets] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [view, setView] = useState<TongaPlayback>(() =>
    survey(
      Math.max(
        START,
        Math.min(
          END,
          ((initial?.at ?? Date.parse(timeIso(ERUPTION))) - Date.parse("2022-01-15T00:00:00Z")) / 60_000,
        ),
      ),
      stations.find((station) => station.id === initial?.choice),
    ),
  );
  const clock = useRef(view);
  const images = useRef<Satellite>({ infrared: null, vapor: null });
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);
  const update = (next: TongaPlayback) => {
    clock.current = next;
    setView(next);
  };

  useEffect(() => {
    let closed = false;
    void Promise.all([loadImage(infraredUrl), loadImage(vaporUrl)]).then(([infrared, vapor]) => {
      if (closed) return;
      images.current = { infrared, vapor };
      setAssets(infrared && vapor ? "ready" : infrared || vapor ? "partial" : "error");
    });
    return () => {
      closed = true;
    };
  }, []);

  useEffect(() => {
    if (!view.playing || assets === "loading" || !ready) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const elapsed = Math.min(
        duration(current),
        current.elapsed + (previous === undefined ? 0 : now - previous),
      );
      previous = now;
      const next = { ...current, elapsed, playing: elapsed < duration(current) };
      clock.current = next;
      if (!next.playing || now - lastReadout >= 90) {
        lastReadout = now;
        setView(next);
      }
      if (next.playing) request = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden) request = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [view.playing, assets, ready]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      const current = clock.current;
      if (event.matches && current.anchor === undefined) update(survey(minuteFor(current)));
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, []);

  return {
    assets,
    view,
    images: images.current,
    arrive,
    minute: minuteFor(view),
    ended: view.elapsed >= duration(view),
    seek: (minute: number, station?: TongaStation) => update(survey(minute, station)),
    begin() {
      if (matchMedia(MOTION).matches) update(survey(ERUPTION));
      else {
        setReady(false);
        update({ elapsed: 0, playing: true });
      }
    },
    toggle() {
      const current = clock.current;
      if (current.playing) update({ ...current, playing: false });
      else if (current.elapsed >= duration(current))
        update(
          matchMedia(MOTION).matches ? { ...survey(START), playing: true } : { elapsed: 0, playing: true },
        );
      else update({ ...current, playing: true });
    },
  };
}
