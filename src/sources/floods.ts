import { events, fetchList, isCurrent, listUrl, parseUtc, reportedBy } from "./gdacs";

/* Floods happening now, which for once is a straightforward claim. See ARCHITECTURE.md#srcsourcesfloodsts. */

export interface Flood {
  id: string;
  /** The agency that reported it, or null when GDACS did not say. */
  source: string | null;
  country: string;
  lon: number;
  lat: number;
  startedAt: number | null;
  endedAt: number | null;
}

export function parseFloods(payload: unknown): Flood[] {
  const out: Flood[] = [];
  for (const { lon, lat, props } of events(payload)) {
    if (!isCurrent(props)) continue;
    out.push({
      id: String(props["eventid"] ?? `${lon},${lat}`),
      // Who reported it. See `reportedBy`.
      source: reportedBy(props),
      country: String(props["country"] ?? ""),
      lon,
      lat,
      startedAt: parseUtc(props["fromdate"]),
      endedAt: parseUtc(props["todate"]),
    });
  }
  return out;
}

/** How many countries are involved, which is the figure worth stating for a spread this wide. */
export function countries(floods: readonly Flood[]): number {
  return new Set(floods.map((f) => f.country).filter((c) => c !== "")).size;
}

export async function fetchFloods(
  get: (url: string) => Promise<Response> = fetch,
  onAnswer?: (ok: boolean) => void,
): Promise<Flood[]> {
  return fetchList(listUrl("FL"), parseFloods, get, onAnswer);
}
