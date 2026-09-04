import { describe, expect, it } from "vitest";
import { auroraAt, AURORA_LAT, AURORA_LON, fetchAurora, parseOvation } from "./aurora";

/** A well-formed payload, in the order and range NOAA publishes. */
const payload = (fill: (lon: number, lat: number) => number) => ({
  "Forecast Time": "2026-08-20T20:52:00Z",
  coordinates: Array.from({ length: AURORA_LON * AURORA_LAT }, (_, i) => {
    const lat = Math.floor(i / AURORA_LON) - 90;
    const lon = i % AURORA_LON;
    return [lon, lat, fill(lon, lat)];
  }),
});

describe("reading the published grid", () => {
  it("takes a full grid and keeps the forecast time, which is not the fetch time", () => {
    const a = parseOvation(payload(() => 0))!;
    expect(a.grid).toHaveLength(AURORA_LON * AURORA_LAT);
    expect(a.forecastAt).toBe(Date.parse("2026-08-20T20:52:00Z"));
  });

  it("indexes row-major from the south pole, so nothing is transposed or flipped", () => {
    // A single lit cell at a known place has to come back out of the same place.
    const a = parseOvation(payload((lon, lat) => (lon === 100 && lat === 65 ? 42 : 0)))!;
    expect(auroraAt(a, 100, 65)).toBe(42);
    expect(auroraAt(a, 100, -65)).toBe(0);
    expect(auroraAt(a, 65, 100 - 90)).toBe(0);
    expect(a.peak).toBe(42);
  });

  it("wraps longitude, because the model counts east from zero and the app does not", () => {
    /*
     * The feed publishes 0 to 359 east and the app carries -180 to 180. Rebasing on the way in would be
     * a second place for the seam to be wrong, so it stays as published and callers wrap.
     */
    const a = parseOvation(payload((lon) => (lon === 350 ? 77 : 0)))!;
    expect(auroraAt(a, 350, 0)).toBe(77);
    expect(auroraAt(a, -10, 0)).toBe(77);
    expect(auroraAt(a, 710, 0)).toBe(77);
  });

  it("holds both poles, which is why the grid is 181 rows and not 180", () => {
    const a = parseOvation(payload((_lon, lat) => (Math.abs(lat) === 90 ? 9 : 0)))!;
    expect(auroraAt(a, 0, 90)).toBe(9);
    expect(auroraAt(a, 0, -90)).toBe(9);
  });

  it("reports a quiet sky as quiet rather than as missing", () => {
    // The measured peak on an ordinary evening was 28 out of 100, so a low peak is the normal case and
    // has to be distinguishable from a failed fetch, which is null.
    const a = parseOvation(payload(() => 0))!;
    expect(a).not.toBeNull();
    expect(a.peak).toBe(0);
  });

  it("clamps a probability rather than trusting the range", () => {
    const a = parseOvation(payload(() => 250))!;
    expect(a.peak).toBe(100);
  });

  it("refuses a grid of the wrong size instead of drawing a partial sky", () => {
    /*
     * A half-filled grid is a claim that the sky is dark everywhere the parser gave up, which is worse
     * than no aurora at all.
     */
    expect(parseOvation({ coordinates: [[0, 0, 5]] })).toBeNull();
    expect(parseOvation({ coordinates: [] })).toBeNull();
    expect(parseOvation({})).toBeNull();
    expect(parseOvation(null)).toBeNull();
    expect(parseOvation("nope")).toBeNull();
  });

  it("refuses a row that is not three numbers", () => {
    const bad = payload(() => 0);
    (bad.coordinates as unknown[])[500] = [0, "north", 5];
    expect(parseOvation(bad)).toBeNull();
  });

  it("refuses coordinates outside the grid rather than writing past the end", () => {
    const bad = payload(() => 0);
    (bad.coordinates as unknown[])[10] = [400, 0, 5];
    expect(parseOvation(bad)).toBeNull();
    const bad2 = payload(() => 0);
    (bad2.coordinates as unknown[])[10] = [0, 200, 5];
    expect(parseOvation(bad2)).toBeNull();
  });

  it("falls back to now when the timestamp is unusable, rather than refusing the grid", () => {
    const a = parseOvation({ ...payload(() => 1), "Forecast Time": "soon" })!;
    expect(Number.isFinite(a.forecastAt)).toBe(true);
  });
});

describe("fetching it", () => {
  it("hands back null on a bad status rather than throwing into the app", () => {
    const dead = async (): Promise<Response> => new Response("", { status: 503 });
    return expect(fetchAurora(dead)).resolves.toBeNull();
  });

  it("hands back null when the request fails outright", () => {
    // Optional by design, like the EMSC catalogue seed: a sky that fails to load is not a broken feed.
    const boom = async (): Promise<Response> => {
      throw new Error("offline");
    };
    return expect(fetchAurora(boom)).resolves.toBeNull();
  });

  it("parses a good response", async () => {
    const ok = async (): Promise<Response> =>
      new Response(JSON.stringify(payload((_lon, lat) => (lat > 60 ? 30 : 0))));
    const a = await fetchAurora(ok);
    expect(a?.peak).toBe(30);
  });
});
