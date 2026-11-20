import { expect, test } from "vitest";
import { horizontal, localNight, moonsetBetween, skyBodies, type SkyCity } from "./tonight";
import { nightTrail } from "./nightTrail";
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

test("moonset marks a descending crossing of the same horizon shown in Tonight’s Sky", () => {
  const start = Date.parse("2026-11-07T00:00:00Z");
  const set = moonsetBetween(newYork, start, start + 24 * 60 * 60_000);
  expect(set).not.toBeNull();
  expect(skyBodies(newYork, set! - 60_000)[0]!.altitude).toBeGreaterThan(0);
  expect(skyBodies(newYork, set! + 60_000)[0]!.altitude).toBeLessThan(0);
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

test("a selected body's night path shares the time slider's positions and ends at the level horizon", () => {
  const { start, end } = localNight(newYork, Date.parse("2026-11-06T18:00:00Z"));
  for (const name of ["Jupiter", "Moon"]) {
    const points = nightTrail(newYork, name, start, end);
    const at = (time: number) => {
      const { azimuth, altitude } = skyBodies(newYork, time).find((body) => body.name === name)!;
      return { azimuth, altitude };
    };
    expect(points[0]).toEqual(at(start));
    expect(points.at(-1)).toEqual(at(end));
    expect(points.some((point) => point.altitude === 0)).toBe(true);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.altitude * points[i - 1]!.altitude).toBeGreaterThanOrEqual(0);
    }
  }
});

test("a polar observing window never invents an above-horizon path for a planet below it", () => {
  const pole = { name: "South Pole", lon: 0, lat: -90, zone: "UTC" };
  const { start, end } = localNight(pole, Date.parse("2026-11-06T18:00:00Z"));
  const path = nightTrail(pole, "Jupiter", start, end);
  expect(path.length).toBeGreaterThan(2);
  expect(path.every(({ altitude }) => altitude < 0)).toBe(true);
});
