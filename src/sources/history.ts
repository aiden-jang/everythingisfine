import type { Cyclone } from "./cyclones";
import type { Volcano } from "./volcanoes";
import type { Wildfire } from "./wildfires";
import type { Flood } from "./floods";

/* The four non-earthquake layers, for a day that has already happened. See ARCHITECTURE.md. */

/** EONET's category ids, mapped to the four layers this app draws. */
const KINDS = {
  severeStorms: "cyclone",
  volcanoes: "volcano",
  wildfires: "fire",
  floods: "flood",
} as const;

export interface History {
  cyclones: Cyclone[];
  volcanoes: Volcano[];
  fires: Wildfire[];
  floods: Flood[];
  /** Null when the request failed, so "nothing happened" and "nobody answered" stay different facts. */
  answered: boolean;
}

const ENDPOINT = "https://eonet.gsfc.nasa.gov/api/v3/events";

/**
 * A day of the four layers, or `answered: false`. `status=closed` deliberately: an event still open today is
 * already being drawn by the live layers, and including it here would put a fire burning now onto a picture
 * of last July.
 */
export async function fetchHistory(from: number, to: number, get: typeof fetch = fetch): Promise<History> {
  const day = (t: number): string => new Date(t).toISOString().slice(0, 10);
  const empty: History = { cyclones: [], volcanoes: [], fires: [], floods: [], answered: false };
  try {
    const url = `${ENDPOINT}?start=${day(from)}&end=${day(to)}&status=closed&limit=${LIMIT}`;
    const response = await get(url);
    if (!response.ok) return empty;
    return { ...parseHistory(await response.json(), from, to), answered: true };
  } catch {
    return empty;
  }
}

/* Enough for any single day. The busiest sample day carried 34 events, so 400 is a guard against a
 * pathological response rather than a filter the app relies on. Unlike the wildfire feed's hard 100, this
 * cap is ours, which is why the legend has no floor to declare. */
const LIMIT = 400;

/** Knots, as JTWC and NOAA publish storm winds, into the km/h the live layer states. */
const KTS_TO_KMH = 1.852;
/** Acres, as IRWIN publishes burned area, into the hectares `Wildfire` carries. */
const ACRES_TO_HECTARES = 0.404686;

export function parseHistory(payload: unknown, from: number, to: number): Omit<History, "answered"> {
  const out: Omit<History, "answered"> = { cyclones: [], volcanoes: [], fires: [], floods: [] };
  const events = (payload as { events?: unknown })?.events;
  if (!Array.isArray(events)) return out;

  for (const event of events) {
    // A null in the array reads every guard below it as a property access on nothing.
    if (event === null || typeof event !== "object") continue;
    const e = event as {
      id?: unknown;
      title?: unknown;
      closed?: unknown;
      categories?: { id?: unknown }[];
      geometry?: unknown;
    };
    const id = typeof e.id === "string" ? e.id : null;
    const title = typeof e.title === "string" ? e.title : "";
    if (id === null) continue;
    const category = e.categories?.find((c) => typeof c.id === "string" && c.id in KINDS);
    const kind = category ? KINDS[category.id as keyof typeof KINDS] : null;
    if (kind === null) continue;

    /*
     * Points inside the day, oldest first. A storm's geometry is its whole track, and clipping to the
     * requested window is what makes it the track as of that day: without this an archived Tuesday would
     * show where a hurricane went on Friday.
     */
    const points = (Array.isArray(e.geometry) ? e.geometry : [])
      .map(
        (g) =>
          g as { date?: unknown; coordinates?: unknown; magnitudeValue?: unknown; magnitudeUnit?: unknown },
      )
      .filter((g) => Array.isArray(g.coordinates) && g.coordinates.length >= 2)
      .map((g) => ({
        at: typeof g.date === "string" ? Date.parse(g.date) : Number.NaN,
        lon: Number((g.coordinates as number[])[0]),
        lat: Number((g.coordinates as number[])[1]),
        magnitude: typeof g.magnitudeValue === "number" ? g.magnitudeValue : null,
        unit: typeof g.magnitudeUnit === "string" ? g.magnitudeUnit : null,
      }))
      .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
      .filter((p) => !Number.isFinite(p.at) || (p.at >= from && p.at <= to))
      .sort((a, b) => a.at - b.at);
    if (points.length === 0) continue;

    const last = points[points.length - 1]!;
    const closed = typeof e.closed === "string" ? Date.parse(e.closed) : Number.NaN;
    const endedAt = Number.isFinite(closed) ? closed : null;
    const place = placeOf(title);

    if (kind === "cyclone") {
      // The peak over the samples inside the day, which is what the live layer's number also means.
      const peaks = points.map((p) => p.magnitude).filter((m): m is number => m !== null);
      out.cyclones.push({
        id,
        source: null,
        name: stormName(title),
        lon: last.lon,
        lat: last.lat,
        peakKmh: peaks.length > 0 ? Math.round(Math.max(...peaks) * KTS_TO_KMH) : null,
        track: points.map((p) => ({ lon: p.lon, lat: p.lat })),
        startedAt: points[0]!.at || null,
        endedAt,
      });
    } else if (kind === "volcano") {
      // No reporting agency. GDACS credits one on every live hazard; this archive comes from a different
      // feed that does not, so null is "the feed did not say".
      out.volcanoes.push({
        id,
        source: null,
        name: stormName(title),
        country: place,
        lon: last.lon,
        lat: last.lat,
        endedAt,
      });
    } else if (kind === "fire") {
      const acres = points.map((p) => p.magnitude).filter((m): m is number => m !== null);
      out.fires.push({
        id,
        source: null,
        country: place,
        lon: last.lon,
        lat: last.lat,
        hectares: acres.length > 0 ? Math.round(Math.max(...acres) * ACRES_TO_HECTARES) : null,
        startedAt: points[0]!.at || null,
        endedAt,
      });
    } else {
      // No measure, exactly as the live flood layer refuses one: this feed rates none of them either.
      out.floods.push({
        id,
        source: null,
        country: place,
        lon: last.lon,
        lat: last.lat,
        startedAt: points[0]!.at || null,
        endedAt,
      });
    }
  }
  return out;
}

/**
 * The name, from a title written for a person rather than a parser. "Tropical Storm Fabio" and "RANGE
 * Wildfire, Roosevelt, New Mexico" are the two shapes. Storms lose their classification because the app
 * states wind in km/h: GDACS files a 259 km/h storm as "Tropical Storm".
 */
export function stormName(title: string): string {
  const head = title.split(",")[0]!.trim();
  const stripped = head
    .replace(/^(Tropical (Storm|Cyclone|Depression)|Hurricane|Typhoon|Super Typhoon|Cyclone)\s+/i, "")
    .replace(/\s+(Wildfire|Volcano)$/i, "")
    .trim();
  return stripped.length > 0 ? stripped : head;
}

/** Where it was, from a title written in one of two shapes by two upstreams. See ARCHITECTURE.md. */
export function placeOf(title: string): string {
  if (title.includes(",")) {
    const parts = title
      .split(",")
      .slice(1)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  // The id is theirs and means nothing to a reader, so it goes.
  const inPlace = /\bin\s+(.+?)(?:\s+\d+)?$/i.exec(title.trim());
  return inPlace ? inPlace[1]!.trim() : "";
}
