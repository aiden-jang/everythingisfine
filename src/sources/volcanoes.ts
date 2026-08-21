/*
 * Volcanoes with an eruption episode on record, which is not the same as volcanoes erupting now.
 *
 * The distinction is the whole of this module. GDACS lists 23 and flags **none** of them `iscurrent`; the
 * most recently ended episode ended nine days ago and the oldest over two years. Within the last week
 * there are none at all. There is no keyless feed of currently erupting volcanoes: the Smithsonian's
 * weekly report is the authority and sends no CORS header, so reaching it costs a Worker and the
 * zero-invocation deployment with it.
 *
 * So this layer does not claim currency, and the legend says what it is instead. That is not a
 * consolation prize. The reason section I put volcanoes first is that they sit on the same plate
 * boundaries the earthquakes trace, so they reinforce the explanation already drawn underneath the
 * evidence, and that argument does not need any of them to be erupting this minute. It needs them to be
 * volcanoes.
 *
 * `severity` is 0.0 for every one and `severitytext` is empty, so unlike cyclones there is no strength to
 * report. Alert level exists, Green through Red, and is deliberately not used: an Orange on an episode
 * that ended two hundred days ago describes a concern nobody has any more.
 */

const LIST = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
  + "?eventlist=VO&alertlevel=Green;Orange;Red";

export interface Volcano {
  id: string;
  name: string;
  country: string;
  lon: number;
  lat: number;
  /** When the recorded episode ended, which is the only currency claim this data supports. */
  endedAt: number | null;
}

interface Feature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

/**
 * A GDACS timestamp, which arrives without a zone and is UTC.
 *
 * `Date.parse` on "2026-08-11T21:25:00" is read as local time by the platform, which moves every one of
 * these by the viewer's offset and would have a volcano in New Zealand erupting half a day out.
 */
function parseUtc(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null;
  const stamp = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(stamp) ? stamp : null;
}

export function parseVolcanoes(payload: unknown): Volcano[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: Volcano[] = [];
  const seen = new Set<string>();
  for (const raw of features as Feature[]) {
    const p = raw.properties;
    const coords = raw.geometry?.coordinates;
    if (!p || !Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    const name = String(p["eventname"] ?? "unnamed");
    /*
     * One triangle per volcano, not per episode. The list carries Mayon three times and Kanlaon four,
     * because each is an episode, and drawing them stacked would put four marks on one mountain and
     * make the layer look like it had found four volcanoes there.
     */
    const key = `${name}@${lon.toFixed(2)},${lat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(p["eventid"] ?? key),
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
): Promise<Volcano[]> {
  try {
    const res = await get(LIST);
    if (!res.ok) return [];
    return parseVolcanoes(await res.json());
  } catch {
    return [];
  }
}
