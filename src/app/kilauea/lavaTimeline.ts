import data from "./kilauea.json";

export const { bounds, sharedCoast, formerCoast, land, vent, fissures, snapshots, overflight } = data;
export const LAST = snapshots.length - 1;
export const OCEAN_ENTRY = snapshots.findIndex(({ at }) => at.startsWith("2018-06-04T22:00"));
export const COAST_COMPARISON = 48;
export const SURVEY_STEP = 1250;

export interface Camera {
  x: number;
  y: number;
  span: number;
  roll: number;
  pitch: number;
}

export const surveyCamera: Camera = { x: 4250, y: 220, span: 13_100, roll: 0, pitch: 1 };
export const bayCamera: Camera = { x: 9260, y: 1620, span: 5700, roll: 0, pitch: 1 };
export const ventCamera: Camera = { x: vent[0]! + 450, y: vent[1]! + 700, span: 3900, roll: 0, pitch: 1 };

const opening: Camera = { x: -1260, y: -2750, span: 6800, roll: -0.32, pitch: 0.52 };
const shots = [
  { at: 0, camera: opening },
  { at: 2600, camera: { x: 10, y: -1550, span: 3400, roll: -0.15, pitch: 0.65 } },
  { at: 6000, camera: { x: 1890, y: 150, span: 5700, roll: -0.24, pitch: 0.68 } },
  { at: 9500, camera: { x: 5130, y: 1600, span: 5900, roll: -0.1, pitch: 0.73 } },
  { at: 13_600, camera: { x: 8450, y: 2200, span: 5350, roll: 0.13, pitch: 0.82 } },
  { at: 18_700, camera: bayCamera },
];

const beats = [
  0, 1800, 4100, 5750, 7550, 9050, 10_450, 11_700, 13_600, 14_800, 19_050, 20_200, 21_350, 22_450, 23_550,
];
const OVERFLIGHT_START = 15_250;
const OVERFLIGHT_MS = (overflight.count * 1000) / overflight.fps;
const WIPE_START = 24_500;
export const FLIGHT_DURATION = 26_800;
export const SURVEY_DURATION = (LAST + 1) * SURVEY_STEP;

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function flightCamera(elapsed: number): Camera {
  const next = shots.findIndex(({ at }) => elapsed < at);
  if (next < 1) return next === 0 ? opening : bayCamera;
  const a = shots[next - 1]!;
  const b = shots[next]!;
  const t = smooth((elapsed - a.at) / (b.at - a.at));
  return {
    x: mix(a.camera.x, b.camera.x, t),
    y: mix(a.camera.y, b.camera.y, t),
    span: mix(a.camera.span, b.camera.span, t),
    roll: mix(a.camera.roll, b.camera.roll, t),
    pitch: mix(a.camera.pitch, b.camera.pitch, t),
  };
}

export function lavaFrame(elapsed: number, camera?: Camera) {
  if (camera) {
    const index = Math.min(LAST, Math.max(0, Math.floor(elapsed / SURVEY_STEP)));
    return { index, camera, accent: 0.75, wipe: null, footage: null };
  }
  const next = beats.findIndex((at) => elapsed < at);
  const index = next < 0 ? LAST : Math.max(0, next - 1);
  const since = elapsed - beats[index]!;
  const footage = elapsed - OVERFLIGHT_START;
  return {
    index,
    camera: flightCamera(elapsed),
    accent: 0.55 + 0.45 * (1 - smooth(clamp(since / 1250))),
    wipe:
      elapsed >= WIPE_START
        ? COAST_COMPARISON * smooth(clamp((elapsed - WIPE_START) / (FLIGHT_DURATION - WIPE_START)))
        : null,
    footage:
      footage >= 0 && footage < OVERFLIGHT_MS
        ? {
            index: Math.floor((footage * overflight.fps) / 1000),
            opacity: smooth(clamp(Math.min(footage, OVERFLIGHT_MS - footage) / 310)),
          }
        : null,
  };
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Pacific/Honolulu",
});

export function mapDate(at: string) {
  return `${dateFormat.format(new Date(at))} · ${at.slice(11, 16)} HST`;
}
