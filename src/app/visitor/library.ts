import { lunarTraverses } from "../../sources/moonfall/traverses";
import { searchStories } from "../storyIndex";
import { readStoryMoment, writeStoryMoment, type StoryMoment } from "../observations/storyMoment";
import type { SkyLook } from "../../geo/tonight";
import type { MoonfallProgress } from "../../globe/moonfall/scene";
import type { WindSample } from "../../sources/spaceWeather";
import { skyCities } from "../tonight/cities";

export interface VisitPosition {
  moment?: StoryMoment;
  solar?: WindSample;
  sky?: { city: string; at: number; look: SkyLook; lunar?: MoonfallProgress };
  float?: { profile: string; index: number; map?: boolean };
  radar?: { region?: string; at?: number; map: boolean };
}
export interface Visit {
  id: string;
  seen: number;
  completed?: boolean;
  note?: string;
  position: VisitPosition;
  observation?: {
    at: number;
    depth: number;
    temperature: number;
    salinity: number;
    note?: string;
  };
}
export interface Library {
  version: 2;
  recent: Visit[];
  saved: Visit[];
}
export const emptyLibrary = (): Library => ({ version: 2, recent: [], saved: [] });
const ids = new Set(searchStories.map(({ id }) => id));
export const MAX_SAVED_VISITS = ids.size + 24;
export const LIBRARY_MAX_LENGTH = 50_000;

export function savedVisitKey(visit: Visit): string {
  const solar = visit.position.solar;
  if (visit.id === "sun" && solar) return `sun:${solar.source}:${solar.at}`;
  const lunar = visit.position.sky?.lunar;
  if (visit.id === "moonfall" && lunar && lunar.station !== null)
    return `moonfall:${lunar.eva}:${lunar.station}`;
  const moment = visit.position.moment;
  if (visit.id === "katrina" && moment?.chapter === "compare" && moment.at !== undefined)
    return `katrina:${moment.at}`;
  if (visit.id === "kilauea" && moment?.chapter === "compare") return "kilauea:compare";
  return visit.id === "tonga" && moment?.choice && moment.at !== undefined
    ? `tonga:${moment.choice}:${Math.floor(moment.at / 60_000)}`
    : visit.id;
}
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
    const solar = source.solar;
    if (
      raw.id === "sun" &&
      solar &&
      time(solar.at) &&
      typeof solar.source === "string" &&
      /^[A-Z0-9-]{1,20}$/.test(solar.source) &&
      finite(solar.value, 0, 10_000) &&
      (solar.density === null || finite(solar.density, 0, 10_000))
    )
      position.solar = { at: solar.at, source: solar.source, value: solar.value, density: solar.density };
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
        (lunar.station === null ||
          (Number.isInteger(lunar.station) &&
            finite(lunar.station, 0, lunarTraverses[lunar.eva]!.stations.length - 1))) &&
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
      position.float = {
        profile: float.profile,
        index: float.index,
        ...(float.map === true ? { map: true } : {}),
      };
    const radar = source.radar;
    if (radar && typeof radar.map === "boolean") {
      position.radar = { map: radar.map };
      if (typeof radar.region === "string" && /^[a-z-]{1,30}$/.test(radar.region))
        position.radar.region = radar.region;
      if (time(radar.at)) position.radar.at = radar.at;
    }
  }
  const visit: Visit = {
    id: raw.id,
    seen: raw.seen,
    position,
    ...(raw.completed === true ? { completed: true } : {}),
  };
  if (typeof raw.note === "string" && raw.note.length <= 280 && raw.note.trim()) visit.note = raw.note.trim();
  const observation = raw.observation;
  if (
    raw.id === "float" &&
    position.float &&
    observation &&
    time(observation.at) &&
    observation.at === Number(position.float.profile.split("/").at(-1)) &&
    finite(observation.depth, 0, 12_000) &&
    finite(observation.temperature, -3, 50) &&
    finite(observation.salinity, 0, 50)
  ) {
    visit.observation = {
      at: observation.at,
      depth: observation.depth,
      temperature: observation.temperature,
      salinity: observation.salinity,
    };
    if (typeof observation.note === "string" && observation.note.length <= 280 && observation.note.trim())
      visit.observation.note = observation.note.trim();
  }
  return visit;
}

export function readLibrary(text: string | null): Library {
  if (!text || text.length > LIBRARY_MAX_LENGTH) return emptyLibrary();
  try {
    const raw = JSON.parse(text) as { version?: number; recent?: unknown; saved?: unknown };
    if (raw?.version !== 1 && raw?.version !== 2) return emptyLibrary();
    const list = (value: unknown, limit: number, saved = false) => {
      if (!Array.isArray(value)) return [];
      const unique = new Map<string, Visit>();
      for (const item of value.slice(0, MAX_SAVED_VISITS * 2)) {
        const visit = readVisit(item);
        if (!visit) continue;
        const key = saved ? savedVisitKey(visit) : visit.id;
        if (!unique.has(key)) unique.set(key, visit);
      }
      return [...unique.values()].slice(0, limit);
    };
    return { version: 2, recent: list(raw.recent, 6), saved: list(raw.saved, MAX_SAVED_VISITS, true) };
  } catch {
    return emptyLibrary();
  }
}
export function rememberVisit(library: Library, visit: Visit, list: "recent" | "saved"): Library {
  const checked = readVisit(visit);
  if (!checked) return library;
  const key = list === "saved" ? savedVisitKey : (value: Visit) => value.id;
  const entries = [checked, ...library[list].filter((entry) => key(entry) !== key(checked))];
  if (list === "saved" && entries.length > MAX_SAVED_VISITS) return library;
  const next: Library = {
    ...library,
    [list]: list === "recent" ? entries.slice(0, 6) : entries,
  };
  return JSON.stringify(next).length > LIBRARY_MAX_LENGTH ? library : next;
}
