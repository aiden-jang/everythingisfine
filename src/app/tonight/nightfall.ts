import { distanceKm } from "../../geo/sphere";
import { subsolarPoint, sunElevation } from "../../geo/sun";
import { horizontal, localNight, type SkyCity } from "../../geo/nightWindow";
import { skyCities } from "./cities";
import type { SkyPosition } from "./skyMoment";

const DAY = 86_400_000;
const TEN_MINUTES = 600_000;

export function nightfallPosition(at: number, anchor: { lon: number; lat: number }): SkyPosition {
  const cities = skyCities.map((city) => {
    const altitude = sunElevation(city.lon, city.lat, at);
    const evening = altitude > sunElevation(city.lon, city.lat, at + TEN_MINUTES);
    return {
      city,
      score: Math.abs(altitude + 0.833) + distanceKm(anchor.lon, anchor.lat, city.lon, city.lat) / 3_000,
      evening,
    };
  });
  cities.sort((a, b) => Number(b.evening) - Number(a.evening) || a.score - b.score);
  for (const { city } of cities) {
    const nights = [localNight(city, at - DAY), localNight(city, at)].filter((night) => night.sunset);
    nights.sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at));
    const sunset = nights[0]?.start;
    if (sunset !== undefined) {
      return {
        city: city.name,
        at: sunset,
        nightStart: sunset,
        look: { azimuth: horizontal(city, subsolarPoint(sunset)).azimuth, altitude: 13 },
      };
    }
  }
  throw new Error("No featured city has a sunset");
}

export function skyLight(city: SkyCity, at: number, night: ReturnType<typeof localNight>) {
  if (night.sunset && at === night.start) return "Sunset";
  if (night.sunrise && at === night.end) return "Sunrise";
  const sun = sunElevation(city.lon, city.lat, at);
  return sun >= -0.833 ? "Daylight" : sun > -18 ? "Twilight" : "Dark sky";
}
