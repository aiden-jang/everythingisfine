import { describe, expect, it } from "vitest";
import { tourArrivedAt } from "./tour";

describe("camera arrival before tour narration", () => {
  const target = { lon: -179, lat: 89, zoom: 1.5 };
  it("uses wrapped longitude and the camera's latitude limit without changing the event", () => {
    expect(tourArrivedAt({ lon: 179, lat: 85, zoom: 1.5 }, target)).toBe(true);
    expect(target.lat).toBe(89);
  });
  it("waits for location and zoom to settle", () => {
    expect(tourArrivedAt({ lon: 179, lat: 85, zoom: 1 }, target)).toBe(false);
    expect(tourArrivedAt({ lon: 150, lat: 85, zoom: 1.5 }, target)).toBe(false);
    expect(tourArrivedAt({ lon: 179, lat: 60, zoom: 1.5 }, target)).toBe(false);
  });
});
