import { describe, expect, it } from "vitest";
import { APRIL_ECLIPSE_END, APRIL_ECLIPSE_START, aprilEclipseAt } from "../geo/aprilEclipse";
import { eclipseAt, solarEclipse } from "../geo/eclipse";
import { eclipseFrame, pathFraction, progressAt } from "./eclipseReplay";

const from = { lon: 145, lat: 12, zoom: 1 };

describe("April 2024 eclipse replay", () => {
  it("interpolates NASA's centreline near greatest eclipse", () => {
    const at = Date.parse("2024-04-08T18:17:15Z");
    const centre = aprilEclipseAt(at)!;
    expect(centre.lat).toBeCloseTo(25.29, 1);
    expect(centre.lon).toBeCloseTo(-104.13, 1);
    expect(centre.widthKm).toBeCloseTo(197.5, 0);
    expect(aprilEclipseAt(APRIL_ECLIPSE_START - 1)).toBeNull();
    expect(aprilEclipseAt(APRIL_ECLIPSE_END + 1)).toBeNull();
    expect(eclipseAt(solarEclipse(at).centre).lon).toBeCloseTo(centre.lon);
  });

  it("flies from the current view, follows the same clock as the shadow, then pulls back", () => {
    expect(eclipseFrame(0, from, false)).toEqual({ at: APRIL_ECLIPSE_START, camera: from });
    const middle = eclipseFrame(progressAt(0.5), from, false);
    expect(middle.camera.lon).toBeCloseTo(eclipseAt(solarEclipse(middle.at).centre).lon);
    expect(middle.camera.lat).toBeCloseTo(eclipseAt(solarEclipse(middle.at).centre).lat);
    expect(eclipseFrame(1, from, false).at).toBe(APRIL_ECLIPSE_END);
    expect(eclipseFrame(1, from, false).camera.zoom).toBeLessThan(middle.camera.zoom);
    expect(pathFraction(progressAt(0.25))).toBeCloseTo(0.25);
  });

  it("holds the overview as time changes with reduced motion", () => {
    const start = eclipseFrame(0, from, true);
    const end = eclipseFrame(1, from, true);
    expect(start.camera).toEqual(end.camera);
    expect(start.at).toBeLessThan(end.at);
  });
});
