import data from "./a68.json";

export type Point = [lon: number, lat: number];
export type Fix = [day: number, lon: number, lat: number];
interface Track {
  id: string;
  fixes: Fix[];
}

const DAY_MS = 86_400_000;
const first = Date.parse(data.start);
const day = (date: string) => (Date.parse(date) - first) / DAY_MS;
const format = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const tracks = data.tracks as Track[];
export const { coast } = data;
export const END = day(data.end);
export const BREAKUP = day("2020-12-23");
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function dayAt(at: number | undefined) {
  return at === undefined ? 0 : Math.max(0, Math.min(END, Math.round((at - first) / DAY_MS)));
}

export function dateIso(offset: number) {
  return new Date(first + Math.floor(offset) * DAY_MS).toISOString().slice(0, 10);
}

export function dateLabel(offset: number) {
  return format.format(first + Math.floor(offset) * DAY_MS);
}

export const nameOf = (id: string) => `A-68${id}`;

export function latestIndex(fixes: Fix[], date: number): number {
  let lo = 0;
  let hi = fixes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (fixes[mid]![0] <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function positionAt(track: Track, date: number, index = latestIndex(track.fixes, date)): Point | null {
  const from = track.fixes[index];
  if (!from) return null;
  if (Math.floor(date) === from[0]) {
    const to = track.fixes[index + 1];
    if (to && to[0] === from[0] + 1) {
      const fraction = date - from[0];
      return [mix(from[1], to[1], fraction), mix(from[2], to[2], fraction)];
    }
    return [from[1], from[2]];
  }
  return null;
}

const overview = { lon: -37.5, lat: -54.8, zoom: 2.4 };
const mainTrack = tracks[0]!;

export function driftCamera(day: number) {
  const fix = mainTrack.fixes[latestIndex(mainTrack.fixes, day)] ?? mainTrack.fixes[0]!;
  const point = positionAt(mainTrack, day) ?? [fix[1], fix[2]];
  const progress = Math.min(1, Math.max(0, (day - (BREAKUP - 3)) / 22));
  const release = progress * progress * (3 - 2 * progress);
  return {
    lon: mix(point[0] + 1.6, overview.lon, release),
    lat: mix(point[1] + 0.45, overview.lat, release),
    zoom: mix(3.6, overview.zoom, release),
    bank: 0.055 * (1 - release),
  };
}
