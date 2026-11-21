import { moonPosition, moonRadii } from "./moon";
import { planetPositions } from "./planets";
import { toVec3 } from "./sphere";
import { subsolarPoint } from "./sun";
import { horizontal, type SkyCity, type SkyLook } from "./nightWindow";

export { horizontal, localNight, localNightOn, type SkyCity, type SkyLook } from "./nightWindow";

export interface TonightView {
  kind: "tonight";
  city: SkyCity;
  at: number;
  look: SkyLook;
  bodies: ReturnType<typeof skyBodies>;
  targetName?: string | undefined;
  nightStart?: number;
  sunCover?: number;
  radiantTrail?: readonly SkyLook[];
  nightTrail?: { points: readonly SkyLook[]; following: boolean } | undefined;
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

export function moonsetBetween(city: SkyCity, start: number, end: number) {
  const altitude = (at: number) => {
    const moon = moonPosition(at);
    return horizontal(city, moon, moonRadii(moon.distanceKm)).altitude;
  };
  const interval = 10 * 60_000;
  let previous = start;
  let above = altitude(start) >= 0;
  for (let at = Math.min(start + interval, end); at > previous; at = Math.min(at + interval, end)) {
    const nextAbove = altitude(at) >= 0;
    if (above && !nextAbove) {
      let lo = previous;
      let hi = at;
      while (hi - lo > 1_000) {
        const mid = (lo + hi) / 2;
        if (altitude(mid) >= 0) lo = mid;
        else hi = mid;
      }
      return Math.round((lo + hi) / 2);
    }
    previous = at;
    above = nextAbove;
  }
  return null;
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
