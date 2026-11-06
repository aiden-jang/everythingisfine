import data from "./a68.json";

export type Point = [lon: number, lat: number];
export type Fix = [day: number, lon: number, lat: number];
export type Photo = "approach" | "breakup" | "fragments";
export interface Track {
  id: string;
  fixes: Fix[];
}
export interface Camera {
  lon: number;
  lat: number;
  span: number;
  roll: number;
  pitch: number;
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
export const { coast, axes, areas } = data;
export const END = day(data.end);
export const BREAKUP = day("2020-12-23");
const JANUARY = day("2021-01-11");
export const FIRST_FRAGMENT = tracks[1]!.fixes[0]![0];
export const SURVEY_MS = 20_000;
export const FLIGHT_MS = 28_300;
export const overview: Camera = { lon: -37.5, lat: -54.8, span: 1170, roll: 0, pitch: 1 };

const beats = [
  [0, 0],
  [3600, 0],
  [8700, day("2020-12-15")],
  [11_400, BREAKUP],
  [14_500, BREAKUP],
  [17_500, JANUARY],
  [19_850, JANUARY],
  [22_900, day("2021-02-10")],
  [FLIGHT_MS, END],
];

const shots: { at: number; camera: Camera }[] = [
  { at: 0, camera: { lon: -43.1, lat: -56.0, span: 590, roll: -0.26, pitch: 0.73 } },
  { at: 4200, camera: { lon: -41.4, lat: -55.5, span: 760, roll: -0.17, pitch: 0.76 } },
  { at: 9300, camera: { lon: -37.8, lat: -55.35, span: 510, roll: 0.09, pitch: 0.77 } },
  { at: 14_800, camera: { lon: -36.8, lat: -55.85, span: 585, roll: -0.14, pitch: 0.8 } },
  { at: 20_100, camera: { lon: -36.5, lat: -55.65, span: 630, roll: 0.07, pitch: 0.87 } },
  { at: 26_000, camera: overview },
];

const photos = [
  { id: "approach", start: 0, end: 3600, fadeIn: 0 },
  { id: "breakup", start: 11_400, end: 14_500, fadeIn: 430 },
  { id: "fragments", start: 17_500, end: 19_850, fadeIn: 390 },
] as const;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => t * t * (3 - 2 * t);

function flightDay(elapsed: number): number {
  const next = beats.findIndex(([at]) => elapsed < at!);
  if (next < 1) return next === 0 ? 0 : END;
  const [from, a] = beats[next - 1]!;
  const [to, b] = beats[next]!;
  return mix(a!, b!, (elapsed - from!) / (to! - from!));
}

function cameraAt(elapsed: number): Camera {
  const next = shots.findIndex(({ at }) => elapsed < at);
  if (next < 1) return next === 0 ? shots[0]!.camera : overview;
  const a = shots[next - 1]!;
  const b = shots[next]!;
  const t = ease((elapsed - a.at) / (b.at - a.at));
  return {
    lon: mix(a.camera.lon, b.camera.lon, t),
    lat: mix(a.camera.lat, b.camera.lat, t),
    span: mix(a.camera.span, b.camera.span, t),
    roll: mix(a.camera.roll, b.camera.roll, t),
    pitch: mix(a.camera.pitch, b.camera.pitch, t),
  };
}

export function driftFrame(elapsed: number, survey: boolean, still?: Photo) {
  const date = survey ? Math.round(1e6 * END * clamp(elapsed / SURVEY_MS)) / 1e6 : flightDay(elapsed);
  const camera = survey ? overview : cameraAt(elapsed);
  const shot = survey ? undefined : photos.find(({ start, end }) => elapsed >= start && elapsed < end);
  const photo = still
    ? { id: still, opacity: 1, progress: 1 }
    : shot
      ? {
          id: shot.id,
          opacity: ease(
            clamp(
              Math.min(shot.fadeIn ? (elapsed - shot.start) / shot.fadeIn : 1, (shot.end - elapsed) / 650),
            ),
          ),
          progress: clamp((elapsed - shot.start) / (shot.end - shot.start)),
        }
      : null;
  return { day: date, camera, photo };
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
