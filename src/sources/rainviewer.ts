import type { RadarScan } from "./radar";

export const RAINVIEWER_CATALOGUE = "https://api.rainviewer.com/public/weather-maps.json";
const TILES = "https://tilecache.rainviewer.com";
export const GLOBAL_RADAR_BOUNDS = [-180, -85.0511287798066, 180, 85.0511287798066] as const;

export function rainviewerScans(raw: unknown, now: number): RadarScan[] {
  const data = raw as { host?: unknown; radar?: { past?: unknown } } | null;
  if (data?.host !== TILES || !Array.isArray(data.radar?.past))
    throw new Error("Unexpected RainViewer catalogue");
  const scans = new Map<number, RadarScan>();
  for (const item of data.radar.past) {
    const frame = item as { time?: unknown; path?: unknown } | null;
    if (
      typeof frame?.time !== "number" ||
      !Number.isSafeInteger(frame.time) ||
      frame.time < 1 ||
      frame.time * 1000 > now + 60_000 ||
      typeof frame.path !== "string" ||
      !/^\/v2\/radar\/[a-zA-Z0-9_-]{1,64}$/.test(frame.path)
    )
      continue;
    scans.set(frame.time, { id: frame.time, at: frame.time * 1000, path: frame.path });
  }
  const ordered = [...scans.values()].sort((a, b) => a.at - b.at);
  const cutoff = (ordered.at(-1)?.at ?? now) - 2 * 60 * 60_000;
  return ordered.filter(({ at }) => at >= cutoff).slice(-13);
}

export function rainviewerTiles(path?: string): string[] {
  if (path && !/^\/v2\/radar\/[a-zA-Z0-9_-]{1,64}$/.test(path)) throw new Error("Invalid radar path");
  return [0, 1].flatMap((y) =>
    [0, 1].map((x) =>
      path ? `${TILES}${path}/512/1/${x}/${y}/2/1_0.png` : `${TILES}/v2/coverage/0/512/1/${x}/${y}/0/0_0.png`,
    ),
  );
}

export function radarMercatorY(lat: number): number {
  return (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
}
