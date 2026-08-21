/*
 * The parts of GDACS every hazard layer needs, in one place.
 *
 * Volcanoes, wildfires and floods arrive from the same endpoint in the same envelope, and the third and
 * fourth copies of "read the coordinates, read the zoneless date, skip the broken feature" is where that
 * stops being worth writing again.
 *
 * **The list caps at 100 features and there is no way past it.** `limit`, `pagesize`, `count` and `page`
 * are all ignored and all return exactly 100. Filtering by country *is* honoured, and Angola alone returns
 * a full hundred wildfires, which means the unfiltered global response is a truncated slice of thousands
 * rather than a census. Whether that matters is a question for each layer: floods do not come close to the
 * cap and volcanoes are 23, so both are complete; wildfires are not, and say so.
 *
 * Combining types in one request is therefore a trap. `eventlist=EQ;TC;FL;VO;DR;WF` returns 100 total, of
 * which 69 were wildfires and 2 were floods, silently dropping the rest. One request per type.
 */

const ENDPOINT = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";

/** Every alert level, which is the right default: a Green fire can be the biggest one burning. */
export function listUrl(type: string, levels = "Green;Orange;Red"): string {
  return `${ENDPOINT}?eventlist=${type}&alertlevel=${levels}`;
}

/** One feature, already checked: a real position and properties that exist. */
export interface Event {
  lon: number;
  lat: number;
  props: Record<string, unknown>;
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
export function parseUtc(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null;
  const stamp = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(stamp) ? stamp : null;
}

/** A number, or null. GDACS writes severity as a number and occasionally as a string of one. */
export function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * The usable features of a payload, positions parsed.
 *
 * A feature with no readable coordinates is dropped rather than placed at 0,0, which is in the Gulf of
 * Guinea and would put a wildfire in the sea.
 */
export function events(payload: unknown): Event[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: Event[] = [];
  for (const raw of features as Feature[]) {
    const p = raw.properties;
    const coords = raw.geometry?.coordinates;
    if (!p || !Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push({ lon, lat, props: p });
  }
  return out;
}

/**
 * Whether GDACS considers the event live, which it writes as the string "true".
 *
 * The one field that decides whether a layer may claim the present tense, and the reason the volcano layer
 * does not: none of those are flagged, all hundred wildfires are, and floods split 19 to 81.
 */
export function isCurrent(props: Record<string, unknown>): boolean {
  return String(props["iscurrent"]).toLowerCase() === "true";
}

/** One fetch, one type, failing to an empty list rather than into the app. */
export async function fetchList<T>(
  url: string, parse: (payload: unknown) => T[], get: (url: string) => Promise<Response>,
): Promise<T[]> {
  try {
    const res = await get(url);
    if (!res.ok) return [];
    return parse(await res.json());
  } catch {
    return [];
  }
}
