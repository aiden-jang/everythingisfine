/*
 * Tropical cyclones, as tracks rather than dots.
 *
 * A storm drawn as a point is a dot that happens to be a hurricane. Drawn as a track it explains itself:
 * the measured track of SAUDEL-26 runs from 7.9 to 26.5 degrees of latitude while moving west, which is
 * the poleward curve every cyclone makes and the reason none of them form on the equator. That is the
 * geography this layer arrives with, and the rule in `PLAN.local.md` is that no layer ships without one.
 *
 * **Only what is happening now.** GDACS lists 99 cyclones and flags 3 of them `iscurrent`. The other 96
 * are this season's dead storms, and drawing them would be the EONET mistake again: a map that looks live
 * and is mostly a year old.
 *
 * **The polygons are left on the server on purpose.** Each storm's geometry payload is 370kB of which 49
 * features are wind-radius rings and a forecast cone, and section I is explicit that rings in longitude
 * and latitude walk into all four traps the land mesh paid for. The 17 LineStrings are 28kB and are a
 * polyline, which this codebase already draws correctly for plate boundaries. Taking the cheap 8% and
 * refusing the expensive 92% is the whole of this decision.
 */

const LIST = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
  + "?eventlist=TC&alertlevel=Green;Orange;Red";

const GEOMETRY = "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry";

/** Beyond this a track segment is a wrap across the antimeridian, not a storm crossing it. */
const WRAP_DEG = 170;

export interface Cyclone {
  id: string;
  name: string;
  /** Where it is now. */
  lon: number;
  lat: number;
  /**
   * Strongest wind over the storm's life, in km/h, or null when not published.
   *
   * Their `severity` number, not their `severitytext`. The two disagree systematically: a storm measured
   * at 259 km/h is labelled "Tropical Storm" and one at 243 is labelled "Post-tropical Depression". The
   * likeliest reading is that the number is the peak and the text is the classification now, which are
   * two true statements about different moments. The number is unambiguous, carries a unit, and is the
   * one this app can stand behind.
   */
  peakKmh: number | null;
  /** Where it has been, oldest first, as one polyline. Empty when the track could not be had. */
  track: { lon: number; lat: number }[];
}

interface Feature {
  geometry?: { type?: unknown; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

/** The current storms out of the event list, without their tracks. */
export function parseCycloneList(payload: unknown): Omit<Cyclone, "track">[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: Omit<Cyclone, "track">[] = [];
  for (const raw of features as Feature[]) {
    const p = raw.properties;
    if (!p || String(p["iscurrent"]) !== "true") continue;
    const coords = raw.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords as [unknown, unknown];
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    const severity = (p["severitydata"] as { severity?: unknown } | undefined)?.severity;
    out.push({
      id: String(p["eventid"] ?? ""),
      name: String(p["eventname"] ?? p["name"] ?? "unnamed"),
      lon,
      lat,
      peakKmh: typeof severity === "number" && severity > 0 ? severity : null,
      // Carried so the geometry request can be built without guessing at it.
      ...({ episode: String(p["episodeid"] ?? "") } as Record<string, string>),
    });
  }
  return out;
}

/**
 * The track out of a storm's geometry payload, oldest point first.
 *
 * GDACS publishes it as seventeen two-point LineStrings rather than one line, in reverse order: each
 * segment's start is the previous segment's end. So they are stitched by walking the ends rather than by
 * trusting the `Class` numbering, which is a name and not a promise.
 *
 * A segment spanning more than `WRAP_DEG` of longitude is dropped, for the reason `buildPlates` drops the
 * same thing: a Pacific storm really can cross the antimeridian, and joining 179 to -179 draws a line
 * across the whole world.
 */
export function parseTrack(payload: unknown): { lon: number; lat: number }[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];

  const segments: [number, number][][] = [];
  for (const raw of features as Feature[]) {
    if (raw.geometry?.type !== "LineString") continue;
    const coords = raw.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const points = coords.filter(
      (c): c is [number, number] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number",
    );
    if (points.length >= 2) segments.push(points);
  }
  if (segments.length === 0) return [];

  // Every distinct point, in the order the segments chain them. A set keyed on the coordinate pair is
  // enough: the track is tens of points and the segments overlap end to end.
  const seen = new Set<string>();
  const chained: { lon: number; lat: number }[] = [];
  const push = (p: [number, number]): void => {
    const key = `${p[0]},${p[1]}`;
    if (seen.has(key)) return;
    seen.add(key);
    chained.push({ lon: p[0], lat: p[1] });
  };
  // Reversed, because GDACS lists the newest segment first and a track reads oldest to newest.
  for (const segment of [...segments].reverse()) for (const p of segment) push(p);

  return chained.filter((p, i, all) => {
    if (i === 0) return true;
    return Math.abs(p.lon - all[i - 1]!.lon) <= WRAP_DEG;
  });
}

/** Saffir-Simpson from a wind speed, since GDACS's own label describes a different moment. */
export function category(kmh: number | null): string | null {
  if (kmh === null || !Number.isFinite(kmh) || kmh < 63) return null;
  if (kmh >= 252) return "category 5";
  if (kmh >= 209) return "category 4";
  if (kmh >= 178) return "category 3";
  if (kmh >= 154) return "category 2";
  if (kmh >= 119) return "category 1";
  return "tropical storm";
}

/**
 * Current storms with their tracks, or an empty list on any failure.
 *
 * One request for the list and one per current storm, which is three. Each of those is 370kB for the 28kB
 * of track inside it, which is the price of an endpoint that returns cones and wind rings together with
 * the line. Three requests every ten minutes is worth a picture that explains itself; ninety-nine would
 * not have been.
 */
export async function fetchCyclones(
  get: (url: string) => Promise<Response> = fetch,
): Promise<Cyclone[]> {
  try {
    const res = await get(LIST);
    if (!res.ok) return [];
    const current = parseCycloneList(await res.json());
    return await Promise.all(current.map(async (storm) => {
      const episode = (storm as unknown as { episode?: string }).episode ?? "";
      try {
        const geo = await get(
          `${GEOMETRY}?eventtype=TC&eventid=${storm.id}&episodeid=${episode}`,
        );
        if (!geo.ok) return { ...storm, track: [] };
        return { ...storm, track: parseTrack(await geo.json()) };
      } catch {
        // A storm without its track is still a storm, and still drawn where it is.
        return { ...storm, track: [] };
      }
    }));
  } catch {
    return [];
  }
}
