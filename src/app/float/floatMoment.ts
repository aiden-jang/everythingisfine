import type { StoryMoment } from "../observations/storyMoment";
import type { FloatDiveView } from "./floatPlayback";

export function readFloatMoment(moment: StoryMoment | undefined) {
  if (moment?.id !== "float" || !moment.choice || !moment.chapter) return;
  if (!/^(recorded|recent)\/\d{5,8}\/\d{1,5}\/\d{10,13}$/.test(moment.choice)) return;
  if (!/^\d{1,5}$/.test(moment.chapter)) return;
  const index = Number(moment.chapter);
  if (index > 20_000) return;
  return { profile: moment.choice, index, ...(moment.map ? { map: true } : {}) };
}

export function floatMoment(view: FloatDiveView, map = false): StoryMoment {
  return {
    id: "float",
    choice: `${view.source}/${view.profile.id}`,
    chapter: String(view.read().index),
    map,
  };
}

export function floatNavigationMoment(
  view: FloatDiveView | "opening" | null,
  entry: ReturnType<typeof readFloatMoment>,
  map: boolean,
): StoryMoment | undefined {
  if (!view) return;
  // A fallback is readable, but must not replace the requested source in reload or Back history.
  if (entry && (view === "opening" || `${view.source}/${view.profile.id}` !== entry.profile))
    return { id: "float", choice: entry.profile, chapter: String(entry.index), map };
  return view === "opening" ? undefined : floatMoment(view, map);
}
