import { events, fetchList, isCurrent, listUrl, parseUtc, reportedBy } from "./gdacs";

/*
 * Floods happening now, which for once is a straightforward claim.
 *
 * Nineteen of the hundred are flagged `iscurrent` and all ended within three days; the other eighty-one run
 * to 359 days old, so drawing all hundred would be mostly a flood archive.
 *
 * The list is capped at 100 like every GDACS list, and it does bite: it comes back at exactly 100 across 66
 * countries at no more than three each, while asking for India alone returns 10. What survives the cut is
 * the part this layer draws - measured across the flood-heaviest countries, India, China, Indonesia, the
 * Philippines, Nepal, Bangladesh and Pakistan, **zero current floods were missing from the global list**.
 * So the count on screen is honest without a floor beside it, unlike the wildfires, and that is a
 * measurement rather than an assumption. Re-measure it before trusting it again.
 *
 * No severity to read. GDACS writes `severity: 0.0` for every flood in the list.
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
