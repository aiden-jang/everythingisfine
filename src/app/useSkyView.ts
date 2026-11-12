import { useCallback, useRef, useState } from "react";
import type { VisitPosition } from "./visitor/library";
import type { SkyLook, TonightView } from "../geo/tonight";
import type { TonightPresentation } from "../globe/scenePresentation";
import type { MoonfallProgress } from "../globe/moonfall/scene";

type Entry = {
  mode: "sky" | "meteors" | "moonfall";
  revision: number;
  look?: SkyLook;
  moment?: { city: string; at: number };
  lunar?: MoonfallProgress;
};

export function useSkyView(city: string) {
  const [view, setView] = useState<TonightPresentation | "opening" | null>(null);
  const [entry, setEntry] = useState<Entry>({ mode: "sky", revision: 0 });
  const memory = useRef<TonightView | null>(null);
  const update = useCallback((next: TonightPresentation) => {
    // A meteor shower’s selected date must not overwrite the saved general-sky moment.
    if (!next.moonfall && !next.radiantTrail) memory.current = next;
    setView((active) => (active === null ? null : next));
  }, []);
  const capture = () => {
    if (view === null || view === "opening") return { view, entry };
    const { moonfall, ...sky } = view;
    return {
      view: sky,
      entry: {
        ...entry,
        look: sky.look,
        moment: { city: sky.city.name, at: sky.at },
        ...(moonfall ? { lunar: moonfall.read() } : {}),
      },
    };
  };
  return {
    view,
    entry,
    setView,
    update,
    capture,
    restore(saved: ReturnType<typeof capture>) {
      setView(saved.view);
      setEntry({ ...saved.entry, revision: entry.revision + 1 });
    },
    open(mode: Entry["mode"] = "sky", resume?: VisitPosition["sky"]) {
      const previous = memory.current;
      setEntry((last) => ({
        mode,
        revision: last.revision + 1,
        ...(resume
          ? {
              look: resume.look,
              moment: { city: resume.city, at: resume.at },
              ...(resume.lunar ? { lunar: resume.lunar } : {}),
            }
          : {}),
        ...(!resume && previous?.city.name === city
          ? { look: previous.look, moment: { city: previous.city.name, at: previous.at } }
          : {}),
      }));
      setView("opening");
    },
  };
}
