import type { Cyclone } from "./cyclones";
import type { Volcano } from "./volcanoes";
import type { Wildfire } from "./wildfires";
import type { Flood } from "./floods";

/*
 * The four non-earthquake layers, for a day that has already happened.
 *
 * The archive mode shipped earthquakes only, and the rail said so: "storms, fires, floods, volcanoes and
 * the aurora are live feeds with no history to ask for." That was true of the feeds the app was using and
 * false as a general claim, which made an app named for everything the Earth is doing show a quarter of it
 * on every day but today.
 *
 * **GDACS cannot do this, measured twice.** Its event list takes `fromdate`/`todate` and appears to honour
 * them - one storm came back for a day in July - but the filter runs over the *current* event pool rather
 * than an archive. A year-wide query returns the same 15 fires as no filter at all; 2026-05-15 returns
 * nothing for storms, fires and floods alike while 2024-08-01 returns two fires; `eventlist=VO` with dates
 * answers `204 No Content`; and the separate `ARCHIVE` path ignores the dates and hands back today's list.
 * What looks like history is a handful of long-running current events overlapping the date asked for.
 * Drawing that would put one storm on a day that had many and nothing at all on most days, which is the
 * unlabelled-sample-data lie DESIGN.md section 10 forbids by name.
 *
 * **NASA EONET v3 is a real archive**, and the app's own notes had ruled EONET out for the opposite
 * problem: `status=open` does not mean active, so it was wrong for a *live* layer. History is where its
 * dates are the point rather than the trap. Measured: `start`/`end` are honoured (six events for
 * 2024-08-01, thirty-four for 2026-05-15, different sets), payloads are 14-24kB for a day, geometries are
 * Points, every event carries `closed` and a `magnitudeValue` with a unit, and it answers keylessly with
 * `access-control-allow-origin: *`. v2.1 is not usable: it ignores the range and returns 18.5MB.
 *
 * **It is not a rival dataset.** EONET's sources for these categories are IRWIN and **GDACS itself**, so an
 * archived day is the same provider the live layer uses plus a second one, held historically by NASA. The
 * spread is global rather than the US bias the IRWIN name suggests: 17 North America, 7 Asia, 4 Oceania,
 * 3 Africa on a sample day.
 *
 * **The aurora stays withheld and always will.** NOAA publishes a predicted oval for a stamped minute. A
 * forecast has no history to ask for, so that one sentence in the rail was right all along.
 */

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
 * A day of the four layers, or `answered: false`.
 *
 * `status=closed` deliberately. An event still open today is being drawn by the live layers already, and
 * including it here would put a fire that is burning *now* onto a picture of last July. The archive is the
 * closed record, which is the only part of this feed that describes a finished day.
 */
export async function fetchHistory(
  from: number,
  to: number,
  get: typeof fetch = fetch,
): Promise<History> {
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

/*
 * Enough for any single day and small enough to stay inside the geometry budget.
 *
 * The busiest sample day in this feed carried 34 events; 400 is an order of magnitude above that, so the
 * cap is a guard against a pathological response rather than a filter the app relies on. Unlike the
 * wildfire feed's hard 100, this one is ours, which is why the legend has no floor to declare.
 */
const LIMIT = 400;

/** Knots, as JTWC and NOAA publish storm winds, into the km/h the live layer states. */
const KTS_TO_KMH = 1.852;
/** Acres, as IRWIN publishes burned area, into the hectares `Wildfire` carries. */
const ACRES_TO_HECTARES = 0.404686;

export function parseHistory(
  payload: unknown,
  from: number,
  to: number,
): Omit<History, "answered"> {
  const out: Omit<History, "answered"> = { cyclones: [], volcanoes: [], fires: [], floods: [] };
  const events = (payload as { events?: unknown })?.events;
  if (!Array.isArray(events)) return out;

  for (const event of events) {
    // A null in the array reads every guard below it as a property access on nothing.
    if (event === null || typeof event !== "object") continue;
    const e = event as {
      id?: unknown; title?: unknown; closed?: unknown;
      categories?: { id?: unknown }[]; geometry?: unknown;
    };
    const id = typeof e.id === "string" ? e.id : null;
    const title = typeof e.title === "string" ? e.title : "";
    if (id === null) continue;
    const category = e.categories?.find((c) => typeof c.id === "string" && c.id in KINDS);
    const kind = category ? KINDS[category.id as keyof typeof KINDS] : null;
    if (kind === null) continue;

    /*
     * Points inside the day, oldest first.
     *
     * A storm's geometry is its track - 11 to 25 samples - and clipping to the requested window is what
     * makes the drawn track the track *as of that day* rather than the whole life of the storm. Without
     * this an archived Tuesday would show where a hurricane went on Friday.
     */
    const points = (Array.isArray(e.geometry) ? e.geometry : [])
      .map((g) => g as { date?: unknown; coordinates?: unknown; magnitudeValue?: unknown; magnitudeUnit?: unknown })
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
        id, source: null, name: stormName(title), lon: last.lon, lat: last.lat,
        peakKmh: peaks.length > 0 ? Math.round(Math.max(...peaks) * KTS_TO_KMH) : null,
        track: points.map((p) => ({ lon: p.lon, lat: p.lat })),
      });
    } else if (kind === "volcano") {
      /*
        No reporting agency. GDACS credits one on every live hazard and this is the archive path, which
        comes from a different feed that does not: null is "the feed did not say", which is true here.
      */
      out.volcanoes.push({
        id, source: null, name: stormName(title), country: place, lon: last.lon, lat: last.lat, endedAt,
      });
    } else if (kind === "fire") {
      const acres = points.map((p) => p.magnitude).filter((m): m is number => m !== null);
      out.fires.push({
        id, source: null, country: place, lon: last.lon, lat: last.lat,
        hectares: acres.length > 0 ? Math.round(Math.max(...acres) * ACRES_TO_HECTARES) : null,
        startedAt: points[0]!.at || null, endedAt,
      });
    } else {
      // No measure, exactly as the live flood layer refuses one: this feed rates none of them either.
      out.floods.push({ id, source: null, country: place, lon: last.lon, lat: last.lat, startedAt: points[0]!.at || null, endedAt });
    }
  }
  return out;
}

/**
 * The name, from a title written for a person rather than a parser.
 *
 * "Tropical Storm Fabio" and "RANGE Wildfire, Roosevelt, New Mexico" are the two shapes. Storms get their
 * classification stripped because the app states wind in km/h and never the label - the live layer makes
 * the same choice, since GDACS files a 259 km/h storm as "Tropical Storm".
 */
export function stormName(title: string): string {
  const head = title.split(",")[0]!.trim();
  const stripped = head
    .replace(/^(Tropical (Storm|Cyclone|Depression)|Hurricane|Typhoon|Super Typhoon|Cyclone)\s+/i, "")
    .replace(/\s+(Wildfire|Volcano)$/i, "")
    .trim();
  return stripped.length > 0 ? stripped : head;
}

/**
 * Where it was, from a title written in one of two shapes by two different upstreams.
 *
 * IRWIN writes "RANGE Wildfire, Roosevelt, New Mexico" and the useful part is the last segment, the state.
 * GDACS-sourced rows come through as "Wildfire in Russian Federation 1028712", where the place sits between
 * "in" and a trailing id. Half the rows on a sample day were the second shape and the first version of this
 * returned nothing for all of them, so half the archive labelled itself "Forest fire" with no location.
 */
export function placeOf(title: string): string {
  if (title.includes(",")) {
    const parts = title.split(",").slice(1).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  // The id is theirs and means nothing to a reader, so it goes.
  const inPlace = /\bin\s+(.+?)(?:\s+\d+)?$/i.exec(title.trim());
  return inPlace ? inPlace[1]!.trim() : "";
}
