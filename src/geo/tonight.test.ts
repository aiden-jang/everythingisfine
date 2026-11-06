import { expect, test } from "vitest";
import { horizontal, localNight, skyBodies, type SkyCity } from "./tonight";
import { sunElevation } from "./sun";

const newYork: SkyCity = { name: "New York", lat: 40.7128, lon: -74.006, zone: "America/New_York" };

test("local bearings point east and lunar parallax lowers the horizon crossing", () => {
  const east = { lon: 90, lat: 0 };
  expect(horizontal({ lon: 0, lat: 0 }, east)).toEqual({ azimuth: 90, altitude: expect.closeTo(0) });
  expect(horizontal({ lon: 0, lat: 0 }, east, 60).altitude).toBeCloseTo(-0.955, 2);
});

test("New York Moon and Jupiter agree with airless JPL Horizons reference angles", () => {
  // DE441, observer -74.006° E, 40.7128° N at sea level, quantity 4.
  const at = Date.parse("2026-11-07T02:00:00Z");
  const [moon, jupiter] = ["Moon", "Jupiter"].map((name) =>
    skyBodies(newYork, at).find((body) => body.name === name)!,
  );
  expect(Math.abs(moon!.azimuth - 333.861979)).toBeLessThan(0.6);
  expect(Math.abs(moon!.altitude - -58.518062)).toBeLessThan(0.4);
  expect(Math.abs(jupiter!.azimuth - 38.252556)).toBeLessThan(0.4);
  expect(Math.abs(jupiter!.altitude - -26.652232)).toBeLessThan(0.4);
});

test("sunset to sunrise stays in the selected city's local calendar across the fall clock change", () => {
  const window = localNight(newYork, Date.parse("2026-10-31T17:00:00Z"));
  expect(window.sunset && window.sunrise).toBe(true);
  expect(sunElevation(newYork.lon, newYork.lat, window.start)).toBeCloseTo(-0.833, 0);
  expect(sunElevation(newYork.lon, newYork.lat, window.end)).toBeCloseTo(-0.833, 0);
  const local = new Intl.DateTimeFormat("en", {
    timeZone: newYork.zone,
    day: "numeric",
    timeZoneName: "short",
  });
  const reading = (at: number) =>
    local
      .formatToParts(at)
      .filter(({ type }) => type !== "literal")
      .map(({ value }) => value);
  expect(reading(window.start)).toEqual(["31", "EDT"]);
  expect(reading(window.end)).toEqual(["1", "EST"]);
});

test("polar daylight keeps an evening-to-morning slider with no invented crossings", () => {
  const tromsø = { name: "Tromsø", lat: 69.6492, lon: 18.9553, zone: "Europe/Oslo" };
  const night = localNight(tromsø, Date.parse("2026-06-21T12:00:00Z"));
  expect(night).toEqual({
    sunset: false,
    sunrise: false,
    start: Date.parse("2026-06-21T16:00:00Z"),
    end: Date.parse("2026-06-22T04:00:00Z"),
  });
});
