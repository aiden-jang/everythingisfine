import { describe, expect, it } from "vitest";
import { category, fetchCyclones, parseCycloneList, parseTrack } from "./cyclones";

const storm = (over: Record<string, unknown> = {}) => ({
  geometry: { type: "Point", coordinates: [149.6, 13.7] },
  properties: {
    eventid: 1001305,
    episodeid: 10,
    eventname: "SAUDEL-26",
    iscurrent: "true",
    severitydata: { severity: 222.2208, severitytext: "Tropical Storm (maximum wind speed of 222 km/h)" },
    ...over,
  },
});

describe("which storms are drawn", () => {
  it("keeps only what is happening now", () => {
    /*
     * GDACS lists 99 cyclones and flags 3 current. The other 96 are this season's dead storms, and
     * drawing them is the EONET mistake: a map that looks live and is mostly a year old.
     */
    const list = parseCycloneList({
      features: [storm(), storm({ iscurrent: "false", eventid: 2 }), storm({ eventid: 3 })],
    });
    expect(list.map((s) => s.id)).toEqual(["1001305", "3"]);
  });

  it("takes the wind speed and never their label for it", () => {
    /*
     * Their number and their text disagree systematically: 259 km/h labelled "Tropical Storm", 243
     * labelled "Post-tropical Depression". Two true statements about different moments, and only one of
     * them carries a unit.
     */
    const [s] = parseCycloneList({ features: [storm()] });
    expect(s!.peakKmh).toBeCloseTo(222.2208, 4);
    expect(JSON.stringify(s)).not.toContain("Tropical Storm");
  });

  it("survives a storm with no severity published", () => {
    const [s] = parseCycloneList({ features: [storm({ severitydata: undefined })] });
    expect(s!.peakKmh).toBeNull();
  });

  it("drops anything without a usable position rather than placing it at zero", () => {
    expect(parseCycloneList({ features: [storm({})] })).toHaveLength(1);
    const broken = { ...storm(), geometry: { type: "Point", coordinates: ["x", 1] } };
    expect(parseCycloneList({ features: [broken] })).toEqual([]);
  });

  it("returns nothing for a payload that is not a feature collection", () => {
    expect(parseCycloneList(null)).toEqual([]);
    expect(parseCycloneList({})).toEqual([]);
  });
});

describe("stitching the track", () => {
  /** GDACS publishes newest-first, two points per segment, each chaining to the next. */
  const lines = (pairs: [number, number][][]) => ({
    features: pairs.map((coordinates, i) => ({
      geometry: { type: "LineString", coordinates },
      properties: { Class: `Line_Line_${i}` },
    })),
  });

  it("reads oldest first, whatever order the segments arrive in", () => {
    // The measured payload: newest segment first, each one starting where the previous ended.
    const track = parseTrack(
      lines([
        [
          [132.9, 25.1],
          [129.4, 26.5],
        ],
        [
          [138.0, 22.9],
          [132.9, 25.1],
        ],
        [
          [140.8, 21.6],
          [138.0, 22.9],
        ],
      ]),
    );
    expect(track[0]).toEqual({ lon: 140.8, lat: 21.6 });
    expect(track[track.length - 1]).toEqual({ lon: 129.4, lat: 26.5 });
  });

  it("keeps the poleward curve, which is the whole reason for drawing a track", () => {
    // Latitude has to rise along the track; a storm that read as a straight line would explain nothing.
    const track = parseTrack(
      lines([
        [
          [132.9, 25.1],
          [129.4, 26.5],
        ],
        [
          [138.0, 22.9],
          [132.9, 25.1],
        ],
        [
          [143.4, 20.2],
          [138.0, 22.9],
        ],
        [
          [154.9, 7.9],
          [143.4, 20.2],
        ],
      ]),
    );
    expect(track[0]!.lat).toBeLessThan(track[track.length - 1]!.lat);
    expect(track[0]!.lon).toBeGreaterThan(track[track.length - 1]!.lon);
  });

  it("says each point once, though the segments overlap end to end", () => {
    const track = parseTrack(
      lines([
        [
          [10, 1],
          [11, 2],
        ],
        [
          [9, 0],
          [10, 1],
        ],
      ]),
    );
    expect(track).toEqual([
      { lon: 9, lat: 0 },
      { lon: 10, lat: 1 },
      { lon: 11, lat: 2 },
    ]);
  });

  it("drops a segment that spans the antimeridian rather than drawing across the world", () => {
    /*
     * Pacific storms really do cross 180, and joining 179 to -179 is a hairline straight across the map.
     * Same rule and same reason as `buildPlates`.
     */
    const track = parseTrack(
      lines([
        [
          [179, 10],
          [-179, 11],
        ],
        [
          [177, 9],
          [179, 10],
        ],
      ]),
    );
    expect(track.some((p) => p.lon === -179)).toBe(false);
    expect(track.length).toBeGreaterThan(0);
  });

  it("ignores the polygons in the same payload", () => {
    // 49 of the 67 features are wind rings and a forecast cone, deliberately left on the server.
    const mixed = {
      features: [
        {
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 1],
                [0, 1],
              ],
            ],
          },
          properties: {},
        },
        { geometry: { type: "Point", coordinates: [5, 5] }, properties: {} },
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [10, 1],
              [11, 2],
            ],
          },
          properties: {},
        },
      ],
    };
    expect(parseTrack(mixed)).toEqual([
      { lon: 10, lat: 1 },
      { lon: 11, lat: 2 },
    ]);
  });

  it("has nothing to draw when there are no lines", () => {
    expect(parseTrack({ features: [] })).toEqual([]);
    expect(parseTrack(null)).toEqual([]);
  });
});

describe("naming the strength", () => {
  it("uses Saffir-Simpson on their number, since their label describes another moment", () => {
    expect(category(259)).toBe("category 5");
    expect(category(243)).toBe("category 4");
    expect(category(222)).toBe("category 4");
    expect(category(139)).toBe("category 1");
    expect(category(111)).toBe("tropical storm");
  });

  /* Every rung, from both sides. Two of the five were never named, so either could move unnoticed. */
  it("puts each boundary on the right side of itself", () => {
    const rungs: [number, string][] = [
      [63, "tropical storm"],
      [119, "category 1"],
      [154, "category 2"],
      [178, "category 3"],
      [209, "category 4"],
      [252, "category 5"],
    ];
    for (const [kmh, name] of rungs) expect(category(kmh), `${kmh} km/h`).toBe(name);
    for (const [kmh, name] of rungs.slice(1)) {
      expect(category(kmh - 1), `just under ${kmh}`).not.toBe(name);
    }
  });

  it("declines to name a depression or a missing number", () => {
    expect(category(56)).toBeNull();
    expect(category(62)).toBeNull();
    expect(category(null)).toBeNull();
    expect(category(Number.NaN)).toBeNull();
  });
});

describe("fetching", () => {
  it("gives an empty list rather than throwing into the app", async () => {
    const dead = async (): Promise<Response> => {
      throw new Error("offline");
    };
    await expect(fetchCyclones(dead)).resolves.toEqual([]);
  });

  it("still places a storm whose track could not be fetched", async () => {
    const get = async (url: string): Promise<Response> =>
      url.includes("getgeometry")
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify({ features: [storm()] }));
    const out = await fetchCyclones(get);
    expect(out).toHaveLength(1);
    expect(out[0]!.track).toEqual([]);
    expect(out[0]!.lon).toBe(149.6);
  });
});
