import { describe, expect, it } from "vitest";
import { tourLabel, tourStops, TOUR_MAX_STOPS } from "./tour";
import type { RegionCount } from "./regions";

const row = (name: string, count: number): RegionCount => ({
  region: { name, lon: 1, lat: 2, bounds: [0, 0, 0, 0], zoom: 2 }, count,
});

describe("where the tour goes", () => {
  it("is busiest first, so the trip is worth taking in order", () => {
    const stops = tourStops([row("Chile", 40), row("Japan", 120), row("Italy", 7)]);
    expect(stops.map((s) => s.name)).toEqual(["Japan", "Chile", "Italy"]);
  });

  it("leaves out the regions with nothing in them", () => {
    // A stop with no events is a camera move that means nothing, which is the thing the rule bans.
    const stops = tourStops([row("Japan", 3), row("Quiet", 0)]);
    expect(stops.map((s) => s.name)).toEqual(["Japan"]);
  });

  it("stops after six, so a tour is twenty-one seconds and not forty", () => {
    const many = Array.from({ length: 11 }, (_, i) => row(`R${i}`, 11 - i));
    expect(tourStops(many)).toHaveLength(TOUR_MAX_STOPS);
    expect(tourStops(many, 3)).toHaveLength(3);
  });

  it("breaks a tie by name rather than by list order, so the route is stable", () => {
    /*
     * Otherwise two regions on the same count would swap places between renders and the tour would
     * visit them in a different order every time it was started.
     */
    const a = tourStops([row("Bravo", 5), row("Alpha", 5)]);
    const b = tourStops([row("Alpha", 5), row("Bravo", 5)]);
    expect(a.map((s) => s.name)).toEqual(["Alpha", "Bravo"]);
    expect(b.map((s) => s.name)).toEqual(a.map((s) => s.name));
  });

  it("is empty when nothing is happening, which is a real state", () => {
    expect(tourStops([])).toEqual([]);
    expect(tourStops([row("Quiet", 0)])).toEqual([]);
  });

  it("carries the camera position from the region, not from the events", () => {
    const [stop] = tourStops([row("Japan", 3)]);
    expect(stop).toMatchObject({ lon: 1, lat: 2, zoom: 2, count: 3 });
  });
});

describe("what the rail says at each stop", () => {
  it("names the place, the count and the position in the route", () => {
    const [stop] = tourStops([row("Japan & Kurils", 120)]);
    expect(tourLabel(stop!, 0, 4)).toBe("1 of 4 · Japan & Kurils · 120 events");
  });

  it("says event, singular, when there is one", () => {
    const [stop] = tourStops([row("Iceland", 1)]);
    expect(tourLabel(stop!, 3, 4)).toBe("4 of 4 · Iceland · 1 event");
  });
});
