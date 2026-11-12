import { useCallback, useRef, useState } from "react";
import { stored, store } from "../stored";
import { readLibrary, rememberVisit, type Library, type Visit } from "./library";

// Keep refused writes through Explore's unmount; a page reload still clears this fallback.
let sessionFallback: Library | null = null;

export function useVisitLibrary() {
  const [library, setLibrary] = useState(() => sessionFallback ?? readLibrary(stored("visits")));
  const latest = useRef(library);
  const persisted = useRef(sessionFallback === null);
  const [notice, setNotice] = useState("");
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
    visit: useCallback(
      (visit: Visit) => {
        change((value) => rememberVisit(value, visit, "recent"));
      },
      [change],
    ),
    save(visit: Visit) {
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
      const saved = change((value) => ({ ...value, saved: value.saved.filter((entry) => entry.id !== id) }));
      setNotice(
        saved
          ? "Saved view removed."
          : "Removed for this visit. This browser could not update its saved views.",
      );
    },
    clearRecent() {
      const saved = change((value) => ({ ...value, recent: [] }));
      setNotice(
        saved
          ? "Recent visits cleared."
          : "Cleared for this visit. This browser could not update its saved visits.",
      );
    },
  };
}
