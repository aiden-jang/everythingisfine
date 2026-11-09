import { describe, expect, test } from "vitest";
import { chaseEnd, chaseStart, luxor, shadowAt, totalityPath } from "../app/shadow/path";
import { eclipseFrom, greatestEclipse, localEclipse } from "./eclipse2027";

const at = (hour: number, minute: number, second = 0) => Date.UTC(2027, 7, 2, hour, minute, second);

describe("NASA's 2 August 2027 eclipse predictions", () => {
  test("the centerline and eclipse elements agree across the tabulated globe flight", () => {
    const start = shadowAt(chaseStart);
    const peak = shadowAt(greatestEclipse);
    const end = shadowAt(chaseEnd);
    expect(start).toMatchObject({ lon: -36.23333, lat: 30.48833 });
    expect(peak.lon).toBeCloseTo(33.1833, 1);
    expect(peak.lat).toBeCloseTo(25.505, 1);
    expect(peak.duration).toBeCloseTo(382.6, 0);
    expect(end).toMatchObject({ lon: 86.42, lat: -11.10167 });
    for (const moment of [chaseStart, greatestEclipse, chaseEnd]) {
      expect(eclipseFrom(moment, shadowAt(moment)).total).toBe(true);
    }
    expect(totalityPath.map((line) => line.points.length)).toEqual([104, 103, 104]);
  });

  test("Luxor's sea-level contacts and London's obscuration match NASA's local calculator", () => {
    const total = localEclipse(luxor).visible;
    expect(total?.cover).toBe(1);
    expect(Math.abs(total!.peak - at(10, 5, 14))).toBeLessThan(2500);
    expect(Math.abs(total!.totality![0] - at(10, 2, 3))).toBeLessThan(2500);
    expect(Math.abs(total!.totality![1] - at(10, 8, 24))).toBeLessThan(2500);
    expect(eclipseFrom(at(10, 1), luxor).cover).toBeGreaterThan(0.9);
    expect(eclipseFrom(at(10, 1), luxor).total).toBe(false);
    expect(eclipseFrom(at(11, 30), luxor).cover).toBe(0);
    const partial = localEclipse({ lat: 51.5072, lon: -0.1276 }).visible;
    expect(partial?.totality).toBeNull();
    expect(partial?.cover).toBeCloseTo(0.419, 3);
    expect(Math.abs(partial!.peak - at(9, 0, 6))).toBeLessThan(2500);
  });

  test("a geometric overlap below the saved city's horizon stays invisible", () => {
    const newYork = { lat: 40.7128, lon: -74.006 };
    const forecast = localEclipse(newYork);
    expect(forecast.visible).toBeNull();
    expect(Math.abs(forecast.reference - at(8, 43, 30))).toBeLessThan(5000);
    const frame = eclipseFrom(forecast.reference, newYork);
    expect(frame.altitude).toBeLessThan(0);
    expect(frame.cover).toBe(0);
    expect(frame.total).toBe(false);
  });
});
