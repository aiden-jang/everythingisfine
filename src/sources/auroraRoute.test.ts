import { describe, expect, it } from "vitest";
import { subsolarPoint, sunElevation } from "../geo/sun";
import { AURORA_LAT, AURORA_LON, type Aurora } from "./aurora";
import { auroraRoutes, currentForecast } from "./auroraRoute";

const at = Date.UTC(2026, 2, 21, 0);
const longitude = (lon: number) => ((Math.round(lon) % 360) + 360) % 360;

function forecast(cells: [number, number, number][]): Aurora {
  const grid = new Uint8Array(AURORA_LAT * AURORA_LON);
  for (const [lon, lat, value] of cells) grid[(lat + 90) * AURORA_LON + longitude(lon)] = value;
  return { grid, forecastAt: at, peak: Math.max(0, ...cells.map((cell) => cell[2])) };
}

describe("NOAA aurora overflight", () => {
  it("uses the strongest dark forecast cell, preserving gaps and both hemispheres", () => {
    const day = longitude(subsolarPoint(at).lon);
    const night = longitude(day + 180);
    const routes = auroraRoutes(
      forecast([
        [day, 66, 92],
        [night, 67, 23],
        [night, 70, 29],
        [night, -68, 37],
      ]),
    );
    expect(routes.map(({ hemisphere }) => hemisphere)).toEqual([-1, 1]);
    expect(routes[0]?.focus).toEqual({ lon: night, lat: -68, probability: 37 });
    expect(routes[1]?.focus).toEqual({ lon: night, lat: 70, probability: 29 });
    expect(routes[1]?.oval[day]).toBeNull();
    expect(routes[1]?.oval[longitude(night + 1)]).toBeNull();
    expect(sunElevation(night, 70, at)).toBeLessThan(-6);
  });

  it("leaves quiet or sunlit forecasts without a route and refuses to fly on an unknown clock", () => {
    expect(auroraRoutes(forecast([]))).toEqual([]);
    expect(auroraRoutes(forecast([[subsolarPoint(at).lon, 65, 55]]))).toEqual([]);
    expect(currentForecast(forecast([]), at - 60 * 60_000)).toBe(true);
    expect(currentForecast(forecast([]), at + 91 * 60_000)).toBe(false);
    expect(currentForecast({ ...forecast([]), estimatedTime: true }, at)).toBe(false);
  });
});
