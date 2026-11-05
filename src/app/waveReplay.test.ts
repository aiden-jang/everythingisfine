import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_KM } from "../geo/sphere";
import { P_WAVE_KM_PER_S, S_WAVE_KM_PER_S } from "../geo/waves";
import { createWaveRun, nearbyWaveRoutes, waveAngle } from "./waveReplay";

const origin = { lon: 179, lat: 20, depthKm: 72 };
const city = { name: "Across the seam", lon: -179, lat: 20 };
const route = nearbyWaveRoutes(origin, [city])[0]!;

describe("regional wave replay", () => {
  it("offers nearby cities across the date line and skips unsupported distances", () => {
    const routes = nearbyWaveRoutes(origin, [
      { name: "Too far", lon: -150, lat: 20 },
      city,
      { name: "At the epicentre", lon: 179, lat: 20 },
    ]);
    expect(routes.map(({ city: place }) => place.name)).toEqual([city.name]);
    expect(route.p).toBeLessThan(route.s);
  });

  it("puts each front at the city at its own estimated arrival", () => {
    expect(waveAngle(route.p, P_WAVE_KM_PER_S, origin.depthKm) * EARTH_RADIUS_KM).toBeCloseTo(route.km);
    expect(waveAngle(route.s, S_WAVE_KM_PER_S, origin.depthKm) * EARTH_RADIUS_KM).toBeCloseTo(route.km);
    expect(waveAngle(0.1, P_WAVE_KM_PER_S, origin.depthKm)).toBe(0);
  });

  it("holds the renderer and clock together when paused, then finishes and restarts", () => {
    const run = createWaveRun("quake", route);
    const mid = run.step(2, false);
    run.toggle();
    expect(run.read().at).toBe(mid.at);
    expect(run.step(4, false).at).toBe(mid.at);
    run.toggle();
    expect(run.step(5, false)).toMatchObject({ at: route.s, moving: false });
    expect(run.read()).toMatchObject({ at: route.s, done: true });
    run.toggle();
    expect(run.step(0, false)).toMatchObject({ at: 0, approach: 1, moving: true });
  });

  it("opens at the finished framing under reduced motion", () => {
    const run = createWaveRun("quake", route);
    expect(run.step(0, true)).toMatchObject({ at: route.s, approach: 1, moving: false });
    expect(run.read()).toMatchObject({ reduced: true, done: true });
  });
});
