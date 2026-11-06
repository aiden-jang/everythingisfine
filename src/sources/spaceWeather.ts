import type { Fetcher } from "./types";

const NOAA = "https://services.swpc.noaa.gov";
const MINUTE = 60_000;
export const SOLAR_WIND_URL = NOAA + "/json/rtsw/rtsw_wind_1m.json";
export const XRAY_URL = NOAA + "/json/goes/primary/xrays-6-hour.json";
export const WIND_WINDOW = 60 * MINUTE;
export const XRAY_WINDOW = 6 * 60 * MINUTE;
export const SPACE_WEATHER_FRESHNESS = 15 * MINUTE;

export interface SpaceSample {
  at: number;
  value: number;
  source: string;
}

export interface WindSample extends SpaceSample {
  density: number | null;
}

const row = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readingTime(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z");
}

function parse<T extends SpaceSample>(
  payload: unknown,
  now: number,
  window: number,
  sample: (record: Record<string, unknown>, at: number) => T | null,
): T[] {
  if (!Array.isArray(payload)) throw new Error("Unexpected NOAA response");
  const points = new Map<number, T>();
  for (const record of payload) {
    if (!row(record)) continue;
    const at = readingTime(record["time_tag"]);
    if (!Number.isFinite(at) || at < now - window || at > now + MINUTE) continue;
    const next = sample(record, at);
    if (next) points.set(at, next);
  }
  return Array.from(points.values()).sort((a, b) => a.at - b.at);
}

export function solarWind(payload: unknown, now: number): WindSample[] {
  return parse(payload, now, WIND_WINDOW, (record, at) => {
    const value = record["proton_speed"];
    const density = record["proton_density"];
    const source = record["source"];
    if (record["active"] !== true || !finite(value) || value <= 0 || typeof source !== "string" || !source)
      return null;
    return {
      at,
      value,
      source: source === "SOLAR1" ? "SOLAR-1" : source.slice(0, 24),
      density: finite(density) && density >= 0 ? density : null,
    };
  });
}

export function xrayFlux(payload: unknown, now: number): SpaceSample[] {
  return parse(payload, now, XRAY_WINDOW, (record, at) => {
    const value = record["flux"];
    const satellite = record["satellite"];
    if (
      record["energy"] !== "0.1-0.8nm" ||
      !finite(value) ||
      value <= 0 ||
      !finite(satellite) ||
      satellite < 1
    )
      return null;
    return { at, value, source: `GOES-${satellite}` };
  });
}

export async function fetchSpaceWeather<T extends SpaceSample>(
  fetcher: Fetcher,
  url: string,
  decode: (payload: unknown, now: number) => T[],
  signal: AbortSignal,
): Promise<T[]> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`NOAA returned ${response.status}`);
  return decode(await response.json(), Date.now());
}
