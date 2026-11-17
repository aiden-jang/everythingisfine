import {
  LIBRARY_MAX_LENGTH,
  MAX_SAVED_VISITS,
  readLibrary,
  savedVisitKey,
  type Library,
  type Visit,
} from "./library";

export interface RemovedVisits {
  list: "saved" | "recent";
  items: Visit[];
}

export function restoreVisits(current: Library, removed: RemovedVisits): Library {
  const key = removed.list === "saved" ? savedVisitKey : (value: Visit) => value.id;
  const ids = new Set(current[removed.list].map(key));
  const combined = [...current[removed.list], ...removed.items.filter((visit) => !ids.has(key(visit)))];
  combined.sort((a, b) => b.seen - a.seen);
  if (removed.list === "saved" && combined.length > MAX_SAVED_VISITS) return current;
  const text = JSON.stringify({ ...current, [removed.list]: combined });
  return text.length > LIBRARY_MAX_LENGTH ? current : readLibrary(text);
}
