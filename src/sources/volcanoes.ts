import { events, fetchList, listUrl, parseUtc, reportedBy } from "./gdacs";

/*
 * Volcanoes with an eruption episode on record, which is not the same as volcanoes erupting now.
 *
 * GDACS lists 23 and flags none `iscurrent`; the newest episode ended nine days ago and the oldest over two
 * years. There is no keyless feed of currently erupting volcanoes - the Smithsonian's weekly report sends no
 * CORS header, which would cost a Worker.
 *
 * So this layer claims no currency and the legend says what it is instead. They earn their place by sitting
 * on the same boundaries the earthquakes trace, which needs none of them to be erupting.
 *
 * Alert level exists and is not used: an Orange on an episode that ended two hundred days ago describes a
 * concern nobody has any more.
 */

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
