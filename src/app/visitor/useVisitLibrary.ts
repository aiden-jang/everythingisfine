import { useCallback, useRef, useState } from "react";
import { stored, store } from "../stored";
import { readLibrary, rememberVisit, type Library, type Visit } from "./library";
import { restoreVisits, type RemovedVisits } from "./restoreVisits";

// Keep refused writes through Explore's unmount; a page reload still clears this fallback.
let sessionFallback: Library | null = null;

export function useVisitLibrary() {
  const [library, setLibrary] = useState(() => sessionFallback ?? readLibrary(stored("visits")));
  const latest = useRef(library);
  const persisted = useRef(sessionFallback === null);
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<RemovedVisits | null>(null);
  const change = useCallback((update: (value: Library) => Library) => {
    const next = update(latest.current);
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return persisted.current;
    latest.current = next;
    setLibrary(next);
    persisted.current = store("visits", JSON.stringify(next));
    sessionFallback = persisted.current ? null : next;
    return persisted.current;
  }, []);
  return {
    ...library,
    notice,
    canUndo: removed !== null,
    undo() {
      if (!removed) return;
      const saved = change((value) => restoreVisits(value, removed));
      setRemoved(null);
      setNotice(
        saved
          ? "Restored on this device."
          : "Restored for this visit. This browser could not save the change.",
      );
    },
    visit: useCallback(
      (visit: Visit) => {
        change((value) => rememberVisit(value, visit, "recent"));
      },
      [change],
    ),
    save(visit: Visit) {
      setRemoved(null);
      const persisted = change((value) => rememberVisit(value, { ...visit, seen: Date.now() }, "saved"));
      setNotice(
        persisted
          ? Object.keys(visit.position).length
            ? "Saved on this device."
            : "Saved on this device. Opens the latest available view."
          : "Saved for this visit. This browser could not keep it after a reload.",
      );
    },
    remove(id: string) {
      const items = latest.current.saved.filter((entry) => entry.id === id);
      if (!items.length) return;
      setRemoved({ list: "saved", items });
      const saved = change((value) => ({ ...value, saved: value.saved.filter((entry) => entry.id !== id) }));
      setNotice(
        saved
          ? "Saved view removed."
          : "Removed for this visit. This browser could not update its saved views.",
      );
    },
    clearRecent() {
      if (!latest.current.recent.length) return;
      setRemoved({ list: "recent", items: latest.current.recent });
      const saved = change((value) => ({ ...value, recent: [] }));
      setNotice(
        saved
          ? "Recent visits cleared."
          : "Cleared for this visit. This browser could not update its saved visits.",
      );
    },
  };
}
