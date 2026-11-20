import { useCallback, useEffect, useState } from "react";
import { stored, store } from "../stored";
import { readLibrary, readVisit, rememberVisit, savedVisitKey, type Library, type Visit } from "./library";
import { forgetDepartures, isDeparture, readDepartures } from "./departingVisits";
import { restoreVisits, type RemovedVisits } from "./restoreVisits";

let sessionFallback: Library | null = null;
const snapshot = () =>
  readDepartures(sessionFallback ?? readLibrary(stored("visits-v2") ?? stored("visits")));
const read = () => snapshot().library;

export function useVisitLibrary() {
  const [library, setLibrary] = useState(read);
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<RemovedVisits | null>(null);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!event.key || isDeparture(event.key) || /^(eif|firstmotion)\.visits(-v2)?$/.test(event.key))
        setLibrary(read());
    };
    window.addEventListener("storage", sync);
    setLibrary(read());
    return () => window.removeEventListener("storage", sync);
  }, []);
  const change = useCallback((update: (value: Library) => Library) => {
    const apply = () => {
      const { library: before, keys } = snapshot();
      const next = update(before);
      const changed = next !== before;
      let persisted = sessionFallback === null;
      if (keys.length || (changed && (sessionFallback || JSON.stringify(next) !== JSON.stringify(before)))) {
        persisted = store("visits-v2", JSON.stringify(next));
        sessionFallback = persisted ? null : next;
        if (persisted) forgetDepartures(keys);
      }
      setLibrary(next);
      return { before, changed, persisted };
    };
    if (!navigator.locks) return Promise.resolve(apply());
    return navigator.locks.request("eif.visits-v2", apply).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "SecurityError") return apply();
      throw error;
    });
  }, []);
  return {
    ...library,
    notice,
    canUndo: removed !== null,
    async undo() {
      if (!removed) return;
      const { changed, persisted } = await change((value) => restoreVisits(value, removed));
      if (!changed) {
        setNotice("Your saved collection is full. Remove a saved observation before restoring this one.");
        return;
      }
      setRemoved(null);
      setNotice(
        persisted
          ? "Restored on this device."
          : "Restored for this visit. This browser could not save the change.",
      );
    },
    visit: useCallback(
      (visit: Visit) => {
        void change((value) => rememberVisit(value, visit, "recent"));
      },
      [change],
    ),
    async save(visit: Visit) {
      if (!readVisit(visit)) {
        setNotice("This view couldn’t be kept.");
        return false;
      }
      const { changed, persisted } = await change((value) =>
        rememberVisit(value, { ...visit, seen: Date.now() }, "saved"),
      );
      if (!changed) {
        setNotice("Your saved collection is full. Remove a saved observation before keeping another.");
        return false;
      }
      setRemoved(null);
      setNotice(
        persisted
          ? Object.keys(visit.position).length
            ? "Saved on this device."
            : "Saved on this device. Opens the latest available view."
          : "Saved for this visit. This browser could not keep it after a reload.",
      );
      return true;
    },
    async editNote(key: string, note: string) {
      const { changed, persisted } = await change((value) => {
        const visit = value.saved.find((entry) => savedVisitKey(entry) === key);
        if (!visit) return value;
        return rememberVisit(
          value,
          {
            ...visit,
            seen: Date.now(),
            note,
            ...(visit.observation ? { observation: { ...visit.observation, note } } : {}),
          },
          "saved",
        );
      });
      if (changed) {
        setRemoved(null);
        setNotice(
          persisted
            ? "Saved on this device."
            : "Saved for this visit. This browser could not keep it after a reload.",
        );
      }
      return changed;
    },
    async remove(key: string) {
      const { before, persisted } = await change((value) => ({
        ...value,
        saved: value.saved.filter((entry) => savedVisitKey(entry) !== key),
      }));
      const items = before.saved.filter((entry) => savedVisitKey(entry) === key);
      if (!items.length) return;
      setRemoved({ list: "saved", items });
      setNotice(
        persisted
          ? "Saved view removed."
          : "Removed for this visit. This browser could not update its saved views.",
      );
    },
    async clearRecent() {
      const { before, persisted } = await change((value) => ({ ...value, recent: [] }));
      if (!before.recent.length) return;
      setRemoved({ list: "recent", items: before.recent });
      setNotice(
        persisted
          ? "Recent visits cleared."
          : "Cleared for this visit. This browser could not update its saved visits.",
      );
    },
  };
}
