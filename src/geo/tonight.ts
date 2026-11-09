import { moonPosition, moonRadii } from "./moon";
import { planetPositions } from "./planets";
import { DEG, toVec3 } from "./sphere";
import { subsolarPoint, sunElevation } from "./sun";

export interface SkyCity {
  name: string;
  lon: number;
  lat: number;
  zone: string;
}

export interface SkyLook {
  azimuth: number;
  altitude: number;
}

export interface TonightView {
  kind: "tonight";
  city: SkyCity;
  at: number;
  look: SkyLook;
  bodies: ReturnType<typeof skyBodies>;
  targetName?: string | undefined;
  sunCover?: number;
  radiantTrail?: readonly SkyLook[];
}

const HOUR = 3_600_000;
const SUN_EDGE = -0.833;

export function horizontal(
  observer: { lon: number; lat: number },
  body: { lon: number; lat: number },
  distance = Infinity,
): SkyLook {
  const lat = observer.lat * DEG;
  const dec = body.lat * DEG;
  const offset = (body.lon - observer.lon) * DEG;
  const east = Math.cos(dec) * Math.sin(offset);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(offset) * Math.sin(lat);
  const up = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(offset) * Math.cos(lat);
  return {
    azimuth: (Math.atan2(east, north) / DEG + 360) % 360,
    altitude: Math.atan2(up - 1 / distance, Math.hypot(east, north)) / DEG,
  };
}

export function skyBodies(city: SkyCity, at: number) {
  const moon = moonPosition(at);
  const sun = subsolarPoint(at);
  const lunar = toVec3(moon.lon, moon.lat, 1);
  const sunlight = toVec3(sun.lon, sun.lat, 1);
  const dot = lunar[0] * sunlight[0] + lunar[1] * sunlight[1] + lunar[2] * sunlight[2];
  return [
    {
      name: "Moon",
      ...horizontal(city, moon, moonRadii(moon.distanceKm)),
      magnitude: -12,
      lit: Math.round(50 * (1 - dot)),
    },
    ...planetPositions(at).map((planet) => ({
      name: planet.name,
      ...horizontal(city, planet),
      magnitude: planet.magnitude,
      lit: null,
    })),
  ];
}

function civilClock(zone: string) {
  const format = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  return (at: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(at).map(({ type, value }) => [type, Number(value)]),
    );
    return Date.UTC(parts["year"]!, parts["month"]! - 1, parts["day"]!, parts["hour"]!, parts["minute"]!);
  };
}

function wallTime(clock: (at: number) => number, civil: number) {
  let utc = civil;
  for (let step = 0; step < 3; step++) utc += civil - clock(utc);
  return utc;
}

export function localNight(city: SkyCity, now: number) {
  const clock = civilClock(city.zone);
  const civilDay = Math.floor(clock(now) / (24 * HOUR)) * 24 * HOUR;
  const noon = wallTime(clock, civilDay + 12 * HOUR);
  const nextNoon = wallTime(clock, civilDay + 36 * HOUR);
  const altitude = (at: number) => sunElevation(city.lon, city.lat, at);
  let sunset: number | null = null;
  let sunrise: number | null = null;
  let previous = altitude(noon);
  const step = 5 * 60_000;
  for (let at = noon + step; at <= nextNoon; at += step) {
    const next = altitude(at);
    if (previous >= SUN_EDGE !== next >= SUN_EDGE) {
      let lo = at - step;
      let hi = at;
      while (hi - lo > 1_000) {
        const mid = (lo + hi) / 2;
        if (altitude(mid) >= SUN_EDGE === previous >= SUN_EDGE) lo = mid;
        else hi = mid;
      }
      const crossing = Math.round((lo + hi) / 120_000) * 60_000;
      if (next < previous) sunset ??= crossing;
      else if (sunset !== null) {
        sunrise = crossing;
        break;
      }
    }
    previous = next;
  }
  const start = sunset ?? wallTime(clock, civilDay + 18 * HOUR);
  const end = sunrise ?? wallTime(clock, civilDay + 30 * HOUR);
  return {
    start,
    end: Math.max(start + 60_000, end),
    sunset: sunset !== null,
    sunrise: sunrise !== null,
  };
}

export function localNightOn(city: SkyCity, day: string) {
  return localNight(city, wallTime(civilClock(city.zone), Date.parse(`${day}T12:00:00Z`)));
}

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const bearingLabel = (azimuth: number) => DIRECTIONS[Math.round(azimuth / 45) % 8]!;

export function aimAt(look: SkyLook): SkyLook {
  return { azimuth: look.azimuth, altitude: Math.max(13, look.altitude) };
}

export function openingSky(city: SkyCity, start: number, end: number): TonightView {
  const at = Math.min(start + 50 * 60_000, end);
  const bodies = skyBodies(city, at);
  const best = bodies.filter((body) => body.altitude > 5).sort((a, b) => a.magnitude - b.magnitude)[0];
  const look = aimAt(best ?? { azimuth: horizontal(city, subsolarPoint(at)).azimuth, altitude: 16 });
  return {
    kind: "tonight",
    city,
    at,
    look: { ...look, altitude: Math.min(25, look.altitude) },
    bodies,
    targetName: best?.name,
  };
}
