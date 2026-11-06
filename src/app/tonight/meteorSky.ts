import { gmstDeg } from "../../geo/stars";
import { moonPosition, moonRadii } from "../../geo/moon";
import { sunElevation } from "../../geo/sun";
import { horizontal, localNightOn, type SkyCity } from "../../geo/tonight";
import type { MeteorShower } from "./meteorCalendar";

export function radiantLook(city: SkyCity, shower: MeteorShower, at: number) {
  return horizontal(city, { lon: ((shower.ra - gmstDeg(at) + 540) % 360) - 180, lat: shower.dec });
}

export function meteorNight(city: SkyCity, shower: MeteorShower) {
  const { start, end } = localNightOn(city, shower.day);
  const step = 5 * 60_000;
  const windows: { start: number; end: number }[] = [];
  let open: number | null = null;
  for (let at = start; at <= end; at += step) {
    const moon = moonPosition(at);
    const visible =
      radiantLook(city, shower, at).altitude >= 10 &&
      horizontal(city, moon, moonRadii(moon.distanceKm)).altitude < 0 &&
      sunElevation(city.lon, city.lat, at) <= -18;
    if (visible) open ??= at;
    else if (open !== null) {
      windows.push({ start: open, end: at - step });
      open = null;
    }
  }
  if (open !== null) windows.push({ start: open, end });
  const best = windows.reduce<(typeof windows)[number] | undefined>(
    (longest, window) =>
      !longest || window.end - window.start > longest.end - longest.start ? window : longest,
    undefined,
  );
  return {
    start,
    end,
    windows,
    suggested: best ? Math.round((best.start + best.end) / 120_000) * 60_000 : undefined,
  };
}
