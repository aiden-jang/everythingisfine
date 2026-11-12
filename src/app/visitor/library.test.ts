import { describe, expect, it } from "vitest";
import { emptyLibrary, readLibrary, rememberVisit, type Visit } from "./library";
import { searchStories } from "../storyIndex";

const visit: Visit = {
  id: "katrina",
  seen: Date.UTC(2026, 10, 10),
  position: { moment: { id: "katrina", at: Date.UTC(2005, 7, 29), map: true } },
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
      '{"version":2,"saved":[]}',
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
});
