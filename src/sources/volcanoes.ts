import { events, fetchList, listUrl, parseUtc, reportedBy } from "./gdacs";

/* Volcanoes with an eruption episode on record, which is not the same as volcanoes erupting now. See
   ARCHITECTURE.md. */

export interface Volcano {
  id: string;
  /** The agency that reported it, or null when GDACS did not say. */
  source: string | null;
  name: string;
  country: string;
  lon: number;
  lat: number;
  /** When the recorded episode ended, which is the only currency claim this data supports. */
  endedAt: number | null;
}

export function parseVolcanoes(payload: unknown): Volcano[] {
  const out: Volcano[] = [];
  const seen = new Set<string>();
  for (const { lon, lat, props: p } of events(payload)) {
    const name = String(p["eventname"] ?? "unnamed");
    // One triangle per volcano, not per episode. The list carries Mayon three times and Kanlaon four, and
    // drawing them stacked would make the layer look like it had found four volcanoes there.
    const key = `${name}@${lon.toFixed(2)},${lat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(p["eventid"] ?? key),
      // Who reported it. See `reportedBy`.
      source: reportedBy(p),
      name,
      country: String(p["country"] ?? ""),
      lon,
      lat,
      endedAt: parseUtc(p["todate"]) ?? parseUtc(p["fromdate"]),
    });
  }
  return out;
}

/** The most recent episode end across a set, for a legend that has to state its own span. */
export function newestEpisode(volcanoes: readonly Volcano[]): number | null {
  let newest: number | null = null;
  for (const v of volcanoes) {
    if (v.endedAt === null) continue;
    if (newest === null || v.endedAt > newest) newest = v.endedAt;
  }
  return newest;
}

export async function fetchVolcanoes(
  get: (url: string) => Promise<Response> = fetch,
  onAnswer?: (ok: boolean) => void,
): Promise<Volcano[]> {
  return fetchList(listUrl("VO"), parseVolcanoes, get, onAnswer);
}
