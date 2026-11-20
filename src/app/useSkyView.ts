import { useCallback, useRef, useState } from "react";
import type { VisitPosition } from "./visitor/library";
import type { TonightView } from "../geo/tonight";
import type { TonightPresentation } from "../globe/scenePresentation";
import type { StoryMoment } from "./observations/storyMoment";
import { isSkyStory, skyPosition, skyStoryMoment } from "./tonight/skyMoment";

type Entry = {
  mode: "sky" | "meteors" | "moonfall";
  revision: number;
  position?: VisitPosition["sky"];
};

export function useSkyView(city: string, before: () => void, story?: StoryMoment) {
  const linked = isSkyStory(story?.id) ? story : undefined;
  const [view, setView] = useState<TonightPresentation | "opening" | null>(() => (linked ? "opening" : null));
  const [entry, setEntry] = useState<Entry>(() => ({
    mode: linked?.id === "moonfall" ? "moonfall" : "sky",
    revision: 0,
    position: linked?.sky,
  }));
  const [orbit, setOrbit] = useState(() => !!linked?.sky?.orbit);
  const memory = useRef<TonightView | null>(null);
  const update = useCallback((next: TonightPresentation) => {
    // A meteor shower’s selected date must not overwrite the saved general-sky moment.
    if (!next.moonfall && !next.lunarDeparture && !next.radiantTrail) memory.current = next;
    setView((active) => (active === null ? null : next));
  }, []);
  const capture = () => {
    if (view === null || view === "opening") return { view, entry, orbit };
    const { moonfall, ...sky } = view;
    void moonfall;
    return {
      view: sky,
      orbit,
      entry: {
        ...entry,
        position: skyPosition(view, false, orbit),
      },
    };
  };
  return {
    view,
    entry,
    orbit,
    setOrbit,
    setView,
    update,
    handoff(next: TonightPresentation) {
      before();
      update(next);
    },
    capture,
    moment(map: boolean) {
      if (view === "opening" && isSkyStory(entry.mode))
        return entry.position
          ? skyStoryMoment(entry.mode, entry.position)
          : { id: entry.mode, map: entry.mode === "sky" && map, city };
      if (!view || view === "opening" || view.radiantTrail) return undefined;
      return skyStoryMoment(
        view.lunarDeparture || view.moonfall ? "moonfall" : "sky",
        skyPosition(view, map, orbit),
      );
    },
    restore(saved: ReturnType<typeof capture>) {
      setView(saved.view);
      setOrbit(saved.orbit);
      setEntry({ ...saved.entry, revision: entry.revision + 1 });
    },
    open(mode: Entry["mode"] = "sky", resume?: VisitPosition["sky"] | null) {
      setOrbit(!!resume?.orbit);
      const previous = memory.current;
      setEntry((last) => ({
        mode,
        revision: last.revision + 1,
        position:
          resume ??
          (resume === undefined && previous?.city.name === city
            ? skyPosition(previous, false, false)
            : undefined),
      }));
      setView("opening");
    },
  };
}

export function skyReference(sky: TonightPresentation): TonightPresentation {
  return {
    ...sky,
    earthReference: true,
    reference: sky.reference ?? { lon: sky.city.lon, lat: sky.city.lat, zoom: 1.35 },
  };
}
