/*
 * The parts of GDACS every hazard layer needs, in one place.
 *
 * The list caps at 100 and there is no way past it: `limit`, `pagesize`, `count` and `page` are all ignored
 * and all return exactly 100. Angola alone returns a full hundred wildfires, so the global response is a
 * truncated slice of thousands. Floods and volcanoes are complete; wildfires are not, and say so.
 *
 * One request per type. `eventlist=EQ;TC;FL;VO;DR;WF` returns 100 total, 69 of them wildfires.
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
 * A GDACS timestamp, which arrives without a zone and is UTC. `Date.parse` reads "2026-08-11T21:25:00" as
 * local time, which moves every one of these by the viewer's offset.
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

/** The usable features of a payload, positions parsed. A feature with no readable coordinates is dropped
 * rather than placed at 0,0, which is in the Gulf of Guinea. */
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

/** Whether GDACS considers the event live, which it writes as the string "true". The one field that decides
 * whether a layer may claim the present tense: none of the volcanoes are flagged, all hundred wildfires are,
 * and floods split 19 to 81. */
/**
 * Which agency reported it: `JTWC` for a Pacific typhoon, and so on. GDACS carries this on every event and
 * it was being dropped, while earthquakes have carried their provenance from the beginning.
 *
 * Trimmed and null rather than empty, so a blank never reaches a label as a dangling separator. Left as the
 * agency's own initials: expanding `JTWC` needs a lookup table of forecast centres that would go stale.
 */
export function reportedBy(props: Record<string, unknown>): string | null {
  const raw = props["source"];
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name === "" ? null : name;
}

export function isCurrent(props: Record<string, unknown>): boolean {
  return String(props["iscurrent"]).toLowerCase() === "true";
}

/**
 * One fetch, one type, failing to an empty list rather than into the app.
 *
 * `onAnswer` exists because an empty list and a dead feed drew the same globe: with GDACS down, a viewer read
 * "no storms today" off a page that had never been able to ask.
 *
 * A callback rather than a returned pair: the data shape is consumed by memos all through the app, and a
 * status channel has no business changing any of that.
 */
export async function fetchList<T>(
  url: string,
  parse: (payload: unknown) => T[],
  get: (url: string) => Promise<Response>,
  onAnswer?: (ok: boolean) => void,
): Promise<T[]> {
  try {
    const res = await get(url);
    if (!res.ok) {
      onAnswer?.(false);
      return [];
    }
    const rows = parse(await res.json());
    onAnswer?.(true);
    return rows;
  } catch {
    onAnswer?.(false);
    return [];
  }
}
