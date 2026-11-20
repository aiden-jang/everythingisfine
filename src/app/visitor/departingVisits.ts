import { LIBRARY_MAX_LENGTH, readVisit, rememberVisit, type Library, type Visit } from "./library";

const prefix = "eif.departing.";

// A page can be discarded before a Web Lock is granted. Write its final position separately
// so departure never replaces another tab's saved readings.
export function recordDeparture(visit: Visit) {
  try {
    localStorage.setItem(prefix + Date.now() + "." + crypto.randomUUID(), JSON.stringify(visit));
  } catch {
    // If storage is unavailable the current visit still lives in the tab's library.
  }
}

export function isDeparture(key: string) {
  return key.startsWith(prefix);
}

export function readDepartures(library: Library) {
  const keys: string[] = [];
  const visits: { visit: Visit; departed: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isDeparture(key)) continue;
      keys.push(key);
      const raw = localStorage.getItem(key);
      if (!raw || raw.length > LIBRARY_MAX_LENGTH) continue;
      try {
        const visit = readVisit(JSON.parse(raw));
        if (visit) visits.push({ visit, departed: Number(key.slice(prefix.length).split(".")[0]) || 0 });
      } catch {
        // A damaged departure must not displace valid readings.
      }
    }
  } catch {
    return { library, keys: [] };
  }
  if (visits.length) {
    const recent = new Map(library.recent.map((visit) => [visit.id, visit]));
    for (const { visit } of visits.sort((a, b) => a.departed - b.departed)) {
      if (visit.seen >= (recent.get(visit.id)?.seen ?? 0)) recent.set(visit.id, visit);
    }
    library = { ...library, recent: [] };
    for (const visit of [...recent.values()].sort((a, b) => a.seen - b.seen)) {
      library = rememberVisit(library, visit, "recent");
    }
  }
  return { library, keys };
}

export function forgetDepartures(keys: string[]) {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // The same records can be merged again on the next successful write.
  }
}
