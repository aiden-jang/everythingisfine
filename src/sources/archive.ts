import type { Reading, SourceId } from "../data/types";
import { parseUsgs } from "./usgs";
import { parseEmscFrame } from "./emsc";

/* A day that has already happened, from both agencies. See ARCHITECTURE.md#srcsourcesarchivets. */

const USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";
/** Same service, different method: `count` answers with a number instead of a payload. */
const USGS_COUNT = "https://earthquake.usgs.gov/fdsnws/event/1/count";
const EMSC_QUERY = "https://www.seismicportal.eu/fdsnws/event/1/query";

/** Rows asked for per agency. Below both services' own ceilings and above any real day. A response that
 * comes back at exactly this length is reported as truncated rather than presented as a complete day. */
export const ARCHIVE_LIMIT = 1_500;

/** FDSN wants seconds precision and no zone suffix; both services accept this form. */
const stamp = (at: number): string => new Date(at).toISOString().slice(0, 19);

export interface ArchiveAnswer {
  count: number;
  /** True when the response came back at the row limit, so the day is longer than what arrived. */
  truncated: boolean;
}

export interface Archive {
  from: number;
  to: number;
  readings: Reading[];
  /** What each agency actually answered. Null when the request failed, which is not the same as zero. */
  answered: Record<SourceId, ArchiveAnswer | null>;
}

/** One day from each agency, merged. Failures are per agency and reported rather than thrown: one service
 * being down gives a day from the other with the gap stated. */
export async function fetchArchive(
  from: number,
  to: number,
  minMagnitude: number,
  get: (url: string) => Promise<Response> = fetch,
): Promise<Archive> {
  const at = Date.now();
  const usgsUrl =
    `${USGS_QUERY}?format=geojson&limit=${ARCHIVE_LIMIT}` +
    `&starttime=${stamp(from)}&endtime=${stamp(to)}&minmagnitude=${minMagnitude}`;
  const emscUrl =
    `${EMSC_QUERY}?format=json&limit=${ARCHIVE_LIMIT}` +
    `&starttime=${stamp(from)}&endtime=${stamp(to)}&minmag=${minMagnitude}`;
  const [usgs, emsc] = await Promise.all([
    readArchive(usgsUrl, get, (payload) => parseUsgs(payload, at).readings),
    readArchive(emscUrl, get, (payload) =>
      payload.features.flatMap((feature) => {
        const parsed = parseEmscFrame({ action: "create", data: feature }, at);
        return parsed ? [parsed.reading] : [];
      }),
    ),
  ]);
  return {
    from,
    to,
    readings: [...(usgs?.readings ?? []), ...(emsc?.readings ?? [])],
    answered: { usgs: usgs?.answer ?? null, emsc: emsc?.answer ?? null },
  };
}

async function readArchive(
  url: string,
  get: (url: string) => Promise<Response>,
  parse: (payload: { features: unknown[] }) => Reading[],
) {
  try {
    const response = await get(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as { features?: unknown } | null;
    if (!Array.isArray(payload?.features)) return null;
    const readings = parse({ features: payload.features });
    return {
      readings,
      answer: { count: readings.length, truncated: payload.features.length >= ARCHIVE_LIMIT },
    };
  } catch {
    return null;
  }
}

/**
 * How many events a day holds, without fetching them. FDSN has a `count` method beside `query` that
 * answers `{"count":684}` in forty bytes, so asking about twelve days costs less than one day's events.
 * See ARCHITECTURE.md#srcsourcesarchivets.
 */
export async function countForDay(
  iso: string,
  minMagnitude: number,
  get: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const url =
      `${USGS_COUNT}?format=geojson&starttime=${iso}T00:00:00` +
      `&endtime=${iso}T23:59:59&minmagnitude=${minMagnitude}`;
    const response = await get(url);
    if (!response.ok) return null;
    const body = (await response.json()) as { count?: unknown };
    return typeof body.count === "number" ? body.count : null;
  } catch {
    return null;
  }
}

/** The 24 hours ending at midnight after the chosen day, in UTC so a shared link means one day. */
export function dayRange(iso: string): { from: number; to: number } | null {
  const from = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(from)) return null;
  return { from, to: from + 86_400_000 };
}
