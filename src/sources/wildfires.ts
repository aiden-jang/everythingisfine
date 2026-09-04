import { events, fetchList, isCurrent, listUrl, num, parseUtc, reportedBy } from "./gdacs";

/* Forest fires burning now: live, complete in its dates, incomplete in its count. See ARCHITECTURE.md#srcsourceswildfirests. */

export interface Wildfire {
  id: string;
  /** The agency that reported it, or null when GDACS did not say. */
  source: string | null;
  country: string;
  lon: number;
  lat: number;
  /** Burned area, the one real quantity, in hectares. */
  hectares: number | null;
  startedAt: number | null;
  endedAt: number | null;
}

/** Fires flagged current, which here is all of them, and the filter still belongs in the code. */
export function parseWildfires(payload: unknown): Wildfire[] {
  const out: Wildfire[] = [];
  for (const { lon, lat, props } of events(payload)) {
    if (!isCurrent(props)) continue;
    out.push({
      id: String(props["eventid"] ?? `${lon},${lat}`),
      // Who reported it. See `reportedBy`.
      source: reportedBy(props),
      country: String(props["country"] ?? ""),
      lon,
      lat,
      hectares: num((props["severitydata"] as { severity?: unknown } | undefined)?.severity),
      startedAt: parseUtc(props["fromdate"]),
      endedAt: parseUtc(props["todate"]),
    });
  }
  return out;
}

/** What the legend has to say, computed once from the set rather than asserted. */
export interface FireSummary {
  count: number;
  /** Total burned area in square kilometres, which is the unit a reader has a feel for. */
  km2: number;
  /** Median days burning, the duration fact. Null when no fire carries both dates. */
  medianDays: number | null;
  /** Where most of it is, by area rather than by event count, since the count is truncated. */
  leader: string | null;
}

export function summarise(fires: readonly Wildfire[]): FireSummary {
  const hectares = fires.reduce((sum, f) => sum + (f.hectares ?? 0), 0);
  const spans = fires
    .filter((f) => f.startedAt !== null && f.endedAt !== null)
    .map((f) => (f.endedAt! - f.startedAt!) / 86_400_000)
    .sort((a, b) => a - b);
  const byCountry = new Map<string, number>();
  for (const f of fires) {
    if (f.country === "") continue;
    byCountry.set(f.country, (byCountry.get(f.country) ?? 0) + (f.hectares ?? 0));
  }
  const ranked = [...byCountry].sort((a, b) => b[1] - a[1]);
  return {
    count: fires.length,
    km2: Math.round(hectares / 100),
    medianDays: spans.length === 0 ? null : Math.round(spans[Math.floor(spans.length / 2)]!),
    leader: ranked.length === 0 ? null : ranked[0]![0],
  };
}

/** True when the feed's cap is in play, which is the difference between a floor and a total. */
export const FEED_CAP = 100;

export async function fetchWildfires(
  get: (url: string) => Promise<Response> = fetch,
  onAnswer?: (ok: boolean) => void,
): Promise<Wildfire[]> {
  return fetchList(listUrl("WF"), parseWildfires, get, onAnswer);
}
