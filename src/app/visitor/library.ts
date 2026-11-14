import { searchStories } from "../storyIndex";
import { readStoryMoment, writeStoryMoment, type StoryMoment } from "../observations/storyMoment";
import type { SkyLook } from "../../geo/tonight";
import type { MoonfallProgress } from "../../globe/moonfall/scene";
import { skyCities } from "../tonight/cities";

export interface VisitPosition {
  moment?: StoryMoment;
  sky?: { city: string; at: number; look: SkyLook; lunar?: MoonfallProgress };
  float?: { profile: string; index: number };
  radar?: { region?: string; at?: number; map: boolean };
}
export interface Visit {
  id: string;
  seen: number;
  completed?: boolean;
  position: VisitPosition;
}
export interface Library {
  version: 1;
  recent: Visit[];
  saved: Visit[];
}
export const emptyLibrary = (): Library => ({ version: 1, recent: [], saved: [] });
const ids = new Set(searchStories.map(({ id }) => id));
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const time = (value: unknown): value is number => finite(value, -2_208_988_800_000, 4_102_444_800_000);

export function readVisit(value: unknown): Visit | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Visit;
  if (!ids.has(raw.id) || !time(raw.seen)) return null;
  const position: VisitPosition = {};
  const source = raw.position;
  if (source && typeof source === "object") {
    if (source.moment?.id === raw.id) {
      const params = new URLSearchParams();
      writeStoryMoment(params, source.moment);
      const moment = readStoryMoment(params);
      if (moment) position.moment = moment;
    }
    const sky = source.sky;
    if (
      sky &&
      skyCities.some(({ name }) => name === sky.city) &&
      time(sky.at) &&
      finite(sky.look?.azimuth, 0, 360) &&
      finite(sky.look?.altitude, -90, 90)
    ) {
      position.sky = {
        city: sky.city,
        at: sky.at,
        look: { azimuth: sky.look.azimuth, altitude: sky.look.altitude },
      };
      const lunar = sky.lunar;
      if (
        lunar &&
        Number.isInteger(lunar.eva) &&
        finite(lunar.eva, 0, 2) &&
        finite(lunar.meters, 0, 100_000) &&
        (lunar.station === null || (Number.isInteger(lunar.station) && finite(lunar.station, 0, 100))) &&
        typeof lunar.mapped === "boolean"
      )
        position.sky.lunar = {
          eva: lunar.eva,
          meters: lunar.meters,
          station: lunar.station,
          mapped: lunar.mapped,
        };
    }
    const float = source.float;
    if (
      float &&
      typeof float.profile === "string" &&
      /^(recorded|recent)\/\d{5,8}\/\d{1,5}\/\d{10,13}$/.test(float.profile) &&
      Number.isInteger(float.index) &&
      finite(float.index, 0, 20_000)
    )
      position.float = { profile: float.profile, index: float.index };
    const radar = source.radar;
    if (radar && typeof radar.map === "boolean") {
      position.radar = { map: radar.map };
      if (typeof radar.region === "string" && /^[a-z-]{1,30}$/.test(radar.region))
        position.radar.region = radar.region;
      if (time(radar.at)) position.radar.at = radar.at;
    }
  }
  return { id: raw.id, seen: raw.seen, position, ...(raw.completed === true ? { completed: true } : {}) };
}

export function readLibrary(text: string | null): Library {
  if (!text || text.length > 50_000) return emptyLibrary();
  try {
    const raw = JSON.parse(text) as Library;
    if (raw?.version !== 1) return emptyLibrary();
    const list = (value: unknown, limit: number) => {
      if (!Array.isArray(value)) return [];
      const unique = new Map<string, Visit>();
      for (const item of value.slice(0, ids.size * 2)) {
        const visit = readVisit(item);
        if (visit && !unique.has(visit.id)) unique.set(visit.id, visit);
      }
      return [...unique.values()].slice(0, limit);
    };
    return { version: 1, recent: list(raw.recent, 6), saved: list(raw.saved, ids.size) };
  } catch {
    return emptyLibrary();
  }
}
export function rememberVisit(library: Library, visit: Visit, list: "recent" | "saved"): Library {
  const checked = readVisit(visit);
  if (!checked) return library;
  return {
    ...library,
    [list]: [checked, ...library[list].filter(({ id }) => id !== visit.id)].slice(
      0,
      list === "recent" ? 6 : ids.size,
    ),
  };
}
