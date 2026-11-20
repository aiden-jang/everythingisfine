import type { TonightView, SkyLook } from "../../geo/tonight";
import type { MoonfallProgress } from "../../globe/moonfall/scene";
import type { CameraState } from "../../globe/controlsTypes";
import type { TonightPresentation } from "../../globe/scenePresentation";
import { lunarTraverses } from "../../sources/moonfall/traverses";
import type { StoryMoment } from "../observations/storyMoment";
import { skyCities } from "./cities";

export interface SkyPosition {
  city: string;
  at: number;
  look: SkyLook;
  nightStart?: number;
  target?: string;
  trail?: boolean;
  following?: boolean;
  orbit?: boolean;
  map?: boolean;
  reference?: CameraState;
  lunar?: MoonfallProgress;
}

export const isSkyStory = (id?: string): id is "sky" | "moonfall" => id === "sky" || id === "moonfall";

const numberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const time = (value: unknown): value is number => numberIn(value, -2208988800000, 4102444800000);

export function readSkyPosition(raw: SkyPosition | undefined): SkyPosition | undefined {
  if (
    !raw ||
    !skyCities.some(({ name }) => name === raw.city) ||
    !time(raw.at) ||
    !numberIn(raw.look?.azimuth, 0, 360) ||
    !numberIn(raw.look?.altitude, -90, 90)
  )
    return;
  const { lunar, reference, target, nightStart } = raw;
  const validNight = time(nightStart) && raw.at >= nightStart && raw.at - nightStart <= 24 * 3_600_000;
  const validTarget =
    typeof target === "string" && /^(Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune)$/.test(target);
  const validLunar =
    lunar &&
    Number.isInteger(lunar.eva) &&
    numberIn(lunar.eva, 0, 2) &&
    numberIn(lunar.meters, 0, 100_000) &&
    (lunar.station === null ||
      (Number.isInteger(lunar.station) &&
        numberIn(lunar.station, 0, lunarTraverses[lunar.eva]!.stations.length - 1))) &&
    typeof lunar.mapped === "boolean";
  return {
    city: raw.city,
    at: raw.at,
    look: { azimuth: raw.look.azimuth, altitude: raw.look.altitude },
    ...(validNight ? { nightStart } : {}),
    ...(validTarget
      ? { target, ...(raw.trail === true ? { trail: true, following: raw.following === true } : {}) }
      : {}),
    ...(raw.map === true ? { map: true } : raw.orbit === true ? { orbit: true } : {}),
    ...(reference &&
    numberIn(reference.lon, -180, 360) &&
    numberIn(reference.lat, -90, 90) &&
    numberIn(reference.zoom, 0.05, 12)
      ? { reference: { lon: reference.lon, lat: reference.lat, zoom: reference.zoom } }
      : {}),
    ...(validLunar
      ? { lunar: { eva: lunar.eva, meters: lunar.meters, station: lunar.station, mapped: lunar.mapped } }
      : {}),
  };
}

function fields(params: URLSearchParams, key: string, count: number) {
  const parts = params.get(key)?.split(",");
  return parts?.length === count && parts.every((part) => part.trim()) ? parts.map(Number) : undefined;
}

export function readSkyMoment(params: URLSearchParams, moment: StoryMoment) {
  const aim = fields(params, "look", 2);
  if (!aim || !moment.city || moment.at === undefined) return;
  const orbit = params.get("orbit") === "1";
  const origin =
    fields(params, "reference", 3) ?? (moment.map || orbit ? fields(params, "at", 3) : undefined);
  const route = moment.id === "moonfall" ? fields(params, "rover", 3) : undefined;
  const target = params.get("body");
  const night = params.get("night");
  return readSkyPosition({
    city: moment.city,
    at: moment.at,
    look: { azimuth: aim[0]!, altitude: aim[1]! },
    map: moment.map,
    orbit,
    ...(target
      ? { target, trail: params.get("trail") === "1", following: params.get("follow") === "1" }
      : {}),
    ...(night ? { nightStart: Number(night) } : {}),
    ...(origin ? { reference: { lon: origin[0]!, lat: origin[1]!, zoom: origin[2]! } } : {}),
    ...(route
      ? {
          lunar: {
            eva: route[0]!,
            meters: route[1]!,
            station: route[2] === -1 ? null : route[2]!,
            mapped: params.get("surface") === "map",
          },
        }
      : {}),
  });
}

export function writeSkyMoment(params: URLSearchParams, sky: SkyPosition) {
  params.set("look", `${sky.look.azimuth},${sky.look.altitude}`);
  if (sky.nightStart !== undefined) params.set("night", String(sky.nightStart));
  if (sky.target) {
    params.set("body", sky.target);
    if (sky.trail) params.set("trail", "1");
    if (sky.following) params.set("follow", "1");
  }
  if (sky.orbit) params.set("orbit", "1");
  if (sky.reference)
    params.set("reference", [sky.reference.lon, sky.reference.lat, sky.reference.zoom].join(","));
  if (sky.lunar) {
    params.set("rover", [sky.lunar.eva, sky.lunar.meters, sky.lunar.station ?? -1].join(","));
    if (sky.lunar.mapped) params.set("surface", "map");
  }
}

export function skyPosition(view: TonightPresentation, map: boolean, orbit: boolean): SkyPosition {
  const sky: TonightView = view.lunarDeparture?.previous ?? view;
  return {
    city: sky.city.name,
    at: sky.at,
    look: sky.look,
    ...(sky.nightStart !== undefined ? { nightStart: sky.nightStart } : {}),
    ...(sky.targetName ? { target: sky.targetName } : {}),
    ...(sky.nightTrail ? { trail: true, following: sky.nightTrail.following } : {}),
    ...(map ? { map: true } : orbit ? { orbit: true } : {}),
    ...(view.moonfall ? { lunar: view.moonfall.read() } : {}),
  };
}

export function skyStoryMoment(id: "sky" | "moonfall", sky: SkyPosition): StoryMoment {
  return { id, city: sky.city, at: sky.at, map: id === "sky" && !!sky.map, sky };
}
