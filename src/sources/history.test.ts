import { describe, expect, it } from "vitest";
import { parseHistory, placeOf, stormName } from "./history";

const DAY = Date.parse("2024-08-01T00:00:00Z");
const TO = DAY + 3 * 86_400_000;

const point = (iso: string, lon: number, lat: number, mag?: number, unit?: string): unknown => ({
  date: iso, type: "Point", coordinates: [lon, lat],
  ...(mag === undefined ? {} : { magnitudeValue: mag, magnitudeUnit: unit }),
});

describe("reading a day out of EONET", () => {
  it("maps the four categories it draws and ignores the nine it does not", () => {
    const out = parseHistory({
      events: [
        { id: "a", title: "Tropical Storm Debby", categories: [{ id: "severeStorms" }],
          geometry: [point("2024-08-02T00:00:00Z", -80, 25, 35, "kts")] },
        { id: "b", title: "RANGE Wildfire, Roosevelt, New Mexico", categories: [{ id: "wildfires" }],
          geometry: [point("2024-08-02T00:00:00Z", -103, 34, 2817, "acres")] },
        { id: "c", title: "Flood in Australia 1103887", categories: [{ id: "floods" }],
          geometry: [point("2024-08-02T00:00:00Z", 133, -25)] },
        { id: "d", title: "Etna Volcano, Italy", categories: [{ id: "volcanoes" }],
          geometry: [point("2024-08-02T00:00:00Z", 15, 37)] },
        // Categories this app does not draw, which must not become marks.
        { id: "e", title: "Dust", categories: [{ id: "dustHaze" }],
          geometry: [point("2024-08-02T00:00:00Z", 0, 0)] },
        { id: "f", title: "Ice", categories: [{ id: "seaLakeIce" }],
          geometry: [point("2024-08-02T00:00:00Z", 0, 80)] },
      ],
    }, DAY, TO);
    expect(out.cyclones.map((c) => c.id)).toEqual(["a"]);
    expect(out.fires.map((f) => f.id)).toEqual(["b"]);
    expect(out.floods.map((f) => f.id)).toEqual(["c"]);
    expect(out.volcanoes.map((v) => v.id)).toEqual(["d"]);
  });

  it("converts the units the upstreams publish into the ones the app states", () => {
    // 35 knots is 65km/h. A storm reading 35 anywhere means the knots were passed through raw.
    const out = parseHistory({
      events: [
        { id: "a", title: "Hurricane Carlotta", categories: [{ id: "severeStorms" }],
          geometry: [point("2024-08-02T00:00:00Z", -100, 15, 80, "kts")] },
        { id: "b", title: "Fire, Owyhee, Idaho", categories: [{ id: "wildfires" }],
          geometry: [point("2024-08-02T00:00:00Z", -116, 43, 1000, "acres")] },
      ],
    }, DAY, TO);
    expect(out.cyclones[0]!.peakKmh).toBe(148);
    expect(out.fires[0]!.hectares).toBe(405);
  });

  it("clips a track to the day, so an archived Tuesday is not drawn from Friday", () => {
    const out = parseHistory({
      events: [{
        id: "a", title: "Tropical Storm Debby", categories: [{ id: "severeStorms" }],
        geometry: [
          point("2024-07-30T00:00:00Z", -70, 20, 30, "kts"),
          point("2024-08-02T00:00:00Z", -80, 25, 35, "kts"),
          point("2024-08-03T00:00:00Z", -82, 28, 60, "kts"),
          point("2024-08-20T00:00:00Z", -90, 40, 90, "kts"),
        ],
      }],
    }, DAY, TO);
    const storm = out.cyclones[0]!;
    expect(storm.track).toEqual([{ lon: -80, lat: 25 }, { lon: -82, lat: 28 }]);
    // The peak is the peak *within the day*, not the storm's whole life.
    expect(storm.peakKmh).toBe(Math.round(60 * 1.852));
    // The position is the last sample in the window, which is where it was when the day ended.
    expect([storm.lon, storm.lat]).toEqual([-82, 28]);
  });

  it("drops an event with nothing inside the window at all", () => {
    const out = parseHistory({
      events: [{
        id: "a", title: "Tropical Storm Debby", categories: [{ id: "severeStorms" }],
        geometry: [point("2024-09-01T00:00:00Z", -70, 20, 30, "kts")],
      }],
    }, DAY, TO);
    expect(out.cyclones).toEqual([]);
  });

  it("survives a payload that is not what was promised", () => {
    for (const junk of [null, undefined, {}, { events: "no" }, { events: [null] }, { events: [{}] }]) {
      expect(() => parseHistory(junk, DAY, TO)).not.toThrow();
    }
    expect(parseHistory({ events: [{ id: "a", categories: [{ id: "wildfires" }] }] }, DAY, TO).fires)
      .toEqual([]);
  });
});

describe("the names in those titles", () => {
  it("strips the classification, because the app states wind and never the label", () => {
    expect(stormName("Tropical Storm Fabio")).toBe("Fabio");
    expect(stormName("Tropical Cyclone Emilia")).toBe("Emilia");
    expect(stormName("Hurricane Carlotta")).toBe("Carlotta");
    expect(stormName("Super Typhoon Mawar")).toBe("Mawar");
    expect(stormName("RANGE Wildfire, Roosevelt, New Mexico")).toBe("RANGE");
  });

  it("reads a place out of both shapes the upstreams write", () => {
    expect(placeOf("RANGE Wildfire, Roosevelt, New Mexico")).toBe("New Mexico");
    expect(placeOf("Wildfire in Russian Federation 1028720")).toBe("Russian Federation");
    expect(placeOf("Flood in United States 1103888")).toBe("United States");
    expect(placeOf("Tropical Storm Fabio")).toBe("");
  });
});
