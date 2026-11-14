import { readLibrary, type Library, type Visit } from "./library";

export interface RemovedVisits {
  list: "saved" | "recent";
  items: Visit[];
}

export function restoreVisits(current: Library, removed: RemovedVisits): Library {
  const ids = new Set(current[removed.list].map(({ id }) => id));
  const combined = [...current[removed.list], ...removed.items.filter(({ id }) => !ids.has(id))];
  combined.sort((a, b) => b.seen - a.seen);
  return readLibrary(JSON.stringify({ ...current, [removed.list]: combined }));
}
