/*
 * The aurora oval, from NOAA's OVATION model.
 *
 * The first layer that is not an earthquake, and chosen first because it is the only one that is not more
 * dots: it is a field, so it renders as light on the night side rather than as another marker competing
 * with the ones already there.
 *
 * It also arrives already explained, which is the rule this app now holds every layer to. The globe
 * computes the real subsolar point every minute to shade the night side, and an aurora is visible exactly
 * where that shading is: the terminator the app already draws is the reason the oval appears where it
 * does.
 *
 * Keyless, `access-control-allow-origin: *`, verified from the command line before any of this was
 * written. See `PLAN.local.md` section I for the feeds that failed the same check and why.
 */

/** Aurora probability on a one-degree grid, updated every few minutes. */
export const AURORA_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

/** Columns of longitude, 0 to 359 east, as the model publishes them. */
export const AURORA_LON = 360;
/** Rows of latitude, -90 to 90 inclusive, which is why it is 181 and not 180. */
export const AURORA_LAT = 181;

export interface Aurora {
  /** Probability 0-100 per cell, row-major from the south pole. */
  grid: Uint8Array;
  /** What moment the model is forecasting, which is not when it was fetched. */
  forecastAt: number;
  /** The highest probability anywhere, so a quiet night can be drawn as a quiet night. */
  peak: number;
}

interface Payload {
  coordinates?: unknown;
  ["Forecast Time"]?: unknown;
}

/**
 * The published grid into a raster, or null when the shape is not what it should be.
 *
 * Indexed row-major from the south pole, which is the order a texture wants and the order the feed
 * happens to publish, so nothing is transposed on the way in. Longitude stays 0-359 east rather than
 * being rebased to -180: the shader wraps it with a `fract`, and rebasing here would be a second place
 * for the seam to be got wrong.
 *
 * Returns null rather than a partial grid. A half-filled aurora is a claim about the sky being dark in
 * the places the parser gave up on.
 */
export function parseOvation(payload: unknown): Aurora | null {
  const body = payload as Payload | null;
  const rows = body?.coordinates;
  if (!Array.isArray(rows) || rows.length !== AURORA_LON * AURORA_LAT) return null;

  const grid = new Uint8Array(AURORA_LON * AURORA_LAT);
  let peak = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) return null;
    const [lon, lat, value] = row as [unknown, unknown, unknown];
    if (typeof lon !== "number" || typeof lat !== "number" || typeof value !== "number") return null;
    if (lon < 0 || lon >= AURORA_LON || lat < -90 || lat > 90) return null;
    const probability = Math.max(0, Math.min(100, Math.round(value)));
    grid[(lat + 90) * AURORA_LON + lon] = probability;
    if (probability > peak) peak = probability;
  }

  const stamp = typeof body?.["Forecast Time"] === "string"
    ? Date.parse(body["Forecast Time"] as string)
    : Number.NaN;
  return {
    grid,
    // The fetch time is a poor stand-in and is better than nothing: it is within minutes of the
    // forecast, and the alternative is refusing a usable grid over a malformed timestamp.
    forecastAt: Number.isFinite(stamp) ? stamp : Date.now(),
    peak,
  };
}

/** Probability at a longitude and latitude, for anything that needs to ask outside a shader. */
export function auroraAt(aurora: Aurora, lon: number, lat: number): number {
  const wrapped = ((Math.round(lon) % AURORA_LON) + AURORA_LON) % AURORA_LON;
  const row = Math.max(0, Math.min(AURORA_LAT - 1, Math.round(lat) + 90));
  return aurora.grid[row * AURORA_LON + wrapped] ?? 0;
}

/**
 * Fetches and parses, or null on anything at all going wrong.
 *
 * Optional by design, like EMSC's catalogue seed: the app is a seismic instrument that also draws the
 * sky, and a sky that fails to load must not be reported as a broken feed or hold anything up.
 */
export async function fetchAurora(
  get: (url: string) => Promise<Response> = fetch,
): Promise<Aurora | null> {
  try {
    const res = await get(AURORA_URL);
    if (!res.ok) return null;
    return parseOvation(await res.json());
  } catch {
    return null;
  }
}
