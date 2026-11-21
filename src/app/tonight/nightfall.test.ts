import { expect, test } from "vitest";
import { sunElevation } from "../../geo/sun";
import { skyCities } from "./cities";
import { localNight } from "../../geo/nightWindow";
import { nightfallPosition, skyLight } from "./nightfall";

test("Nightfall chooses a calculated evening close to now throughout the day", () => {
  for (const hour of [0, 4, 8, 12, 16, 20]) {
    const now = Date.UTC(2026, 10, 20, hour);
    const start = nightfallPosition(now, { lon: 179, lat: 45 });
    const city = skyCities.find(({ name }) => name === start.city)!;
    expect(start.at).toBe(start.nightStart);
    expect(Math.abs(start.at - now)).toBeLessThan(3 * 3_600_000);
    expect(sunElevation(city.lon, city.lat, start.at - 60_000)).toBeGreaterThan(-0.833);
    expect(sunElevation(city.lon, city.lat, start.at + 60_000)).toBeLessThan(-0.833);
  }
});

test("the rounded bounds read as sunset and sunrise", () => {
  const city = skyCities[0]!;
  const night = localNight(city, Date.UTC(2026, 10, 20, 12));
  expect(skyLight(city, night.start, night)).toBe("Sunset");
  expect(skyLight(city, night.end, night)).toBe("Sunrise");
});
