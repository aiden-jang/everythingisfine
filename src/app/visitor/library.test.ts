import { describe, expect, it } from "vitest";
import { emptyLibrary, readLibrary, readVisit, rememberVisit, type Visit } from "./library";
import { searchStories } from "../storyIndex";

const visit: Visit = {
  id: "katrina",
  seen: Date.UTC(2026, 10, 10),
  position: { moment: { id: "katrina", at: Date.UTC(2005, 7, 29), map: true } },
};
const observation: Visit = {
  id: "float",
  seen: visit.seen,
  position: { float: { profile: "recorded/6901932/268/1792482240000", index: 61, map: true } },
  observation: {
    at: 1_792_482_240_000,
    depth: 251.45,
    temperature: 12.73,
    salinity: 35.467,
    note: "The water is warmer toward the surface.",
  },
};
describe("local visit library", () => {
  it("round-trips the held historical time and projection, separately from a later visit", () => {
    let library = rememberVisit(emptyLibrary(), visit, "saved");
    library = rememberVisit(
      library,
      { ...visit, position: { moment: { id: "katrina", at: Date.UTC(2005, 7, 30), map: false } } },
      "recent",
    );
    const loaded = readLibrary(JSON.stringify(library));
    expect(loaded.saved).toEqual([visit]);
    expect(loaded.recent[0]?.position.moment?.at).toBe(Date.UTC(2005, 7, 30));
  });
  it("bounds storage and rejects corrupt, unknown and future-version payloads", () => {
    for (const text of [
      "{",
      "null",
      "x".repeat(50_001),
      '{"version":3,"saved":[]}',
      JSON.stringify({
        version: 1,
        saved: [
          { ...visit, id: "unknown" },
          { ...visit, seen: "tomorrow" },
        ],
      }),
    ]) {
      expect(readLibrary(text)).toEqual(emptyLibrary());
    }
    let library = emptyLibrary();
    for (const { id } of searchStories) {
      library = rememberVisit(
        rememberVisit(library, { ...visit, id, position: {} }, "saved"),
        { ...visit, id, position: {} },
        "recent",
      );
    }
    expect(library.saved).toHaveLength(searchStories.length);
    expect(library.recent).toHaveLength(6);
    library = rememberVisit(library, library.saved[0]!, "saved");
    expect(new Set(library.saved.map((v) => v.id)).size).toBe(searchStories.length);
  });
  it("keeps only validated playback fields, never arbitrary stored content", () => {
    const loaded = readLibrary(
      JSON.stringify({
        version: 1,
        saved: [
          {
            ...visit,
            private: "secret",
            position: {
              moment: { id: "tonga", at: 0, map: true },
              sky: { city: "unknown", at: 0, look: { azimuth: 1, altitude: 1 } },
              float: { profile: "https://private.example", index: 3 },
              radar: { map: true, region: "../secret", at: "NaN" },
              note: "private",
            },
          },
        ],
      }),
    );
    expect(loaded.saved[0]).toEqual({ ...visit, position: { radar: { map: true } } });
    expect(JSON.stringify(loaded)).not.toContain("private");
  });
  it("preserves actual float depth, sky time and Apollo traverse progress", () => {
    const position = {
      sky: {
        city: "Seoul",
        at: Date.UTC(2026, 10, 9, 18),
        look: { azimuth: 150, altitude: 32 },
        lunar: { eva: 1, meters: 3210, station: 2, mapped: true },
      },
      float: { profile: "recorded/6901932/268/1792482240000", index: 61 },
    };
    expect(
      readLibrary(JSON.stringify({ version: 1, recent: [{ ...visit, id: "moonfall", position }] })).recent[0]
        ?.position,
    ).toEqual(position);
  });
  it("reloads the kept float sample, source date, map and note independently of later visits", () => {
    let library = rememberVisit(emptyLibrary(), observation, "saved");
    library = rememberVisit(
      library,
      {
        id: "float",
        seen: observation.seen,
        position: { float: { ...observation.position.float!, index: 79 } },
      },
      "recent",
    );
    const reloaded = readLibrary(JSON.stringify(library));
    expect(reloaded.saved).toEqual([observation]);
    expect(reloaded.recent[0]?.position.float?.index).toBe(79);
    expect(reloaded.recent[0]?.observation).toBeUndefined();
    const updated = rememberVisit(
      reloaded,
      { ...observation, observation: { ...observation.observation!, note: "A new observation." } },
      "saved",
    );
    expect(readLibrary(JSON.stringify(updated)).saved[0]?.observation?.note).toBe("A new observation.");
    expect(reloaded.saved[0]?.observation?.note).toBe(observation.observation!.note);
  });
  it("keeps legacy version-one float visits readable without inventing measurements or a map", () => {
    const legacy = {
      id: "float",
      seen: visit.seen,
      position: { float: { profile: "recorded/6901932/268/1792482240000", index: 61 } },
    };
    expect(readLibrary(JSON.stringify({ version: 1, saved: [legacy] })).saved).toEqual([legacy]);
    expect(readVisit({ ...legacy, position: { float: { ...legacy.position.float, map: false } } })).toEqual(
      legacy,
    );
    expect(readVisit({ ...legacy, position: { float: { ...legacy.position.float, map: "true" } } })).toEqual(
      legacy,
    );
  });
  it("accepts measured ranges and rejects nonfinite, impossible or detached float observations", () => {
    for (const fields of [
      { at: NaN },
      { at: observation.observation!.at + 1 },
      { depth: Infinity },
      { depth: -1 },
      { depth: 12_001 },
      { temperature: NaN },
      { temperature: -3.01 },
      { temperature: 50.01 },
      { salinity: -0.01 },
      { salinity: 50.01 },
    ]) {
      expect(
        readVisit({ ...observation, observation: { ...observation.observation, ...fields } })?.observation,
      ).toBeUndefined();
    }
    expect(readVisit({ ...observation, id: "katrina" })?.observation).toBeUndefined();
    expect(readVisit({ ...observation, position: {} })?.observation).toBeUndefined();
    expect(
      readVisit({ ...observation, position: { float: { profile: "private", index: 61 } } })?.observation,
    ).toBeUndefined();
    for (const fields of [
      { depth: 0, temperature: -3, salinity: 0 },
      { depth: 12_000, temperature: 50, salinity: 50 },
    ])
      expect(
        readVisit({ ...observation, observation: { ...observation.observation, ...fields } })?.observation,
      ).toMatchObject(fields);
  });
  it("bounds optional notes and strips unrecognized observation fields", () => {
    for (const note of ["x".repeat(281), 123, {}, null, "   "]) {
      const checked = readVisit({ ...observation, observation: { ...observation.observation, note } });
      expect(checked?.observation).toMatchObject({ temperature: 12.73, salinity: 35.467 });
      expect(checked?.observation?.note).toBeUndefined();
    }
    expect(
      readVisit({
        ...observation,
        observation: { ...observation.observation, note: "  Warm above.  ", private: "secret" },
      })?.observation,
    ).toEqual({ ...observation.observation, note: "Warm above." });
    let library = emptyLibrary();
    for (const { id } of searchStories)
      library = rememberVisit(
        library,
        id === "float" ? observation : { ...visit, id, position: {} },
        "saved",
      );
    library = rememberVisit(
      library,
      { ...observation, observation: { ...observation.observation!, note: "\\".repeat(280) } },
      "saved",
    );
    expect(JSON.stringify(library).length).toBeLessThan(50_000);
    const reloaded = readLibrary(JSON.stringify(library));
    expect(reloaded.saved).toHaveLength(searchStories.length);
    expect(reloaded.saved.find(({ id }) => id === "float")?.observation?.note).toHaveLength(280);
  });
});
