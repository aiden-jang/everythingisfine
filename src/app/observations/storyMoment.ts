import { observations } from "./catalogue";
import { replays } from "./replays";
import { earthStories } from "../earth-stories/catalogue";

export interface StoryMoment {
  id: string;
  at?: number;
  choice?: string;
  city?: string;
  chapter?: string;
  map: boolean;
}

const ids = new Set([
  ...Object.keys(observations),
  ...Object.keys(replays),
  ...Object.keys(earthStories),
  "lights",
  "shadow",
  "kilauea",
]);
const safe = (value: string | null) =>
  value && /^[\p{L}\p{N} .,:_+/-]{1,80}$/u.test(value) ? value : undefined;

export function readStoryMoment(params: URLSearchParams): StoryMoment | undefined {
  const id = params.get("story");
  if (!id || !ids.has(id)) return;
  const result: StoryMoment = { id, map: params.get("p") === "map" };
  const time = params.get("t");
  const at = Number(time);
  if (time?.trim() && Number.isFinite(at) && at >= -2_208_988_800_000 && at <= 4_102_444_800_000)
    result.at = at;
  const choice = safe(params.get("choice"));
  const chapter = safe(params.get("chapter"));
  const city = safe(params.get("city"));
  if (city) result.city = city;
  if (choice) result.choice = choice;
  if (chapter) result.chapter = chapter;
  return result;
}

export function writeStoryMoment(params: URLSearchParams, moment: StoryMoment) {
  params.set("story", moment.id);
  params.set("p", moment.map ? "map" : "globe");
  params.set("v", "observe");
  for (const [key, value] of [
    ["t", moment.at],
    ["choice", moment.choice],
    ["city", moment.city],
    ["chapter", moment.chapter],
  ] as const) {
    if (value !== undefined) params.set(key, String(value));
    else params.delete(key);
  }
}
