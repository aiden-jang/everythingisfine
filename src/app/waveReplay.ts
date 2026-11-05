import { EARTH_RADIUS_KM, distanceKm } from "../geo/sphere";
import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import { MAX_KM, travelTimes } from "./arrival";
import type { Reading } from "../data/types";

export interface WaveCity {
  name: string;
  lon: number;
  lat: number;
}

export interface WaveRoute {
  origin: Pick<Reading, "lon" | "lat" | "depthKm">;
  city: WaveCity;
  km: number;
  p: number;
  s: number;
}

const APPROACH_S = 1.15;
const TRAVEL_S = 5.5;
const FINISH = APPROACH_S + TRAVEL_S;

export function nearbyWaveRoutes(origin: WaveRoute["origin"], cities: readonly WaveCity[]): WaveRoute[] {
  return cities
    .map((city) => ({ city, km: distanceKm(origin.lon, origin.lat, city.lon, city.lat) }))
    .filter(({ km }) => km >= 1 && km <= MAX_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, 6)
    .map(({ city, km }) => ({ origin, city, km, ...travelTimes(km, origin.depthKm) }));
}

// Invert the same depth-corrected path used for the arrival estimate.
export function waveAngle(seconds: number, speed: number, depthKm: number): number {
  const depth = Number.isFinite(depthKm) ? Math.max(0, depthKm) : 0;
  return Math.sqrt(Math.max(0, (seconds * speed) ** 2 - depth ** 2)) / EARTH_RADIUS_KM;
}

interface WaveStatus {
  at: number;
  playing: boolean;
  done: boolean;
  reduced: boolean;
}

export function createWaveRun(key: string, route: WaveRoute) {
  let elapsed = 0;
  let lastUpdate = 0;
  const arrivalAt = () =>
    elapsed >= FINISH ? route.s : (Math.max(0, elapsed - APPROACH_S) / TRAVEL_S) * route.s;
  let snapshot: WaveStatus = { at: 0, playing: true, done: false, reduced: false };
  const subscribers = new Set<() => void>();
  const publish = (next: WaveStatus) => {
    lastUpdate = elapsed;
    snapshot = next;
    for (const subscriber of subscribers) subscriber();
  };
  return {
    key,
    route,
    read: () => snapshot,
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    toggle: () => {
      if (snapshot.done) elapsed = APPROACH_S;
      publish({
        at: arrivalAt(),
        playing: !snapshot.playing,
        done: false,
        reduced: snapshot.reduced,
      });
    },
    step: (dt: number, reduced: boolean) => {
      if (reduced) elapsed = FINISH;
      else if (snapshot.playing) elapsed = Math.min(FINISH, elapsed + dt);
      const done = elapsed >= FINISH;
      const at = arrivalAt();
      const crossedP = snapshot.at < route.p && at >= route.p;
      if (reduced !== snapshot.reduced || done !== snapshot.done || crossedP || elapsed - lastUpdate >= 0.1) {
        publish({ at, done, reduced, playing: snapshot.playing && !done });
      }
      return {
        at,
        approach: Math.min(1, elapsed / APPROACH_S),
        pAngle: waveAngle(at, P_WAVE_KM_PER_S, route.origin.depthKm),
        sAngle: waveAngle(at, S_WAVE_KM_PER_S, route.origin.depthKm),
        moving: snapshot.playing,
      };
    },
  };
}

export type WaveRun = ReturnType<typeof createWaveRun>;
