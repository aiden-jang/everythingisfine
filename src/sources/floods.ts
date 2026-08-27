import { events, fetchList, isCurrent, listUrl, parseUtc, reportedBy } from "./gdacs";

/*
 * Floods happening now, which for once is a straightforward claim.
 *
 * Nineteen of the hundred are flagged `iscurrent` and every one of those ended within three days; the
 * other eighty-one are last year's, running to 359 days old, and a map drawn from all hundred would be
 * mostly a flood archive. So this filters on `iscurrent` like the cyclones do, for the same reason.
 *
 * Unlike wildfires the cap is not in play: floods spread across 68 countries at no more than three each,
 * and a single-country request returns ten where the same request for Angolan fires returns a hundred.
 * Nineteen countries with water where it should not be is a real figure.
 *
 * There is no severity to read. GDACS writes `severity: 0.0` and "Magnitude 0" for every flood in the
 * list, so unlike a fire's hectares there is nothing to rank them by and nothing claimed.
 */

export interface Flood {
  id: string;
  /** The agency that reported it, or null when GDACS did not say. */
  source: string | null;
  country: string;
  lon: number;
  lat: number;
  startedAt: number | null;
  endedAt: number | null;
}

export function parseFloods(payload: unknown): Flood[] {
  const out: Flood[] = [];
  for (const { lon, lat, props } of events(payload)) {
    if (!isCurrent(props)) continue;
    out.push({
      id: String(props["eventid"] ?? `${lon},${lat}`),
      // Who reported it. See `reportedBy`.
      source: reportedBy(props),
      country: String(props["country"] ?? ""),
      lon,
      lat,
      startedAt: parseUtc(props["fromdate"]),
      endedAt: parseUtc(props["todate"]),
    });
  }
  return out;
}

/** How many countries are involved, which is the figure worth stating for a spread this wide. */
export function countries(floods: readonly Flood[]): number {
  return new Set(floods.map((f) => f.country).filter((c) => c !== "")).size;
}

export async function fetchFloods(
  get: (url: string) => Promise<Response> = fetch,
  onAnswer?: (ok: boolean) => void,
): Promise<Flood[]> {
  return fetchList(listUrl("FL"), parseFloods, get, onAnswer);
}
