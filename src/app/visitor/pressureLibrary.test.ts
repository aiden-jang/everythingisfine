import { describe, expect, it } from "vitest";
import {
  emptyLibrary,
  LIBRARY_MAX_LENGTH,
  MAX_SAVED_VISITS,
  readLibrary,
  rememberVisit,
  savedVisitKey,
  type Visit,
} from "./library";
import { restoreVisits } from "./restoreVisits";

const at = Date.parse("2022-01-15T08:59:00Z");
const reading = (offset = 0, note = ""): Visit => ({
  id: "tonga",
  seen: at + offset,
  ...(note ? { note } : {}),
  position: {
    moment: { id: "tonga", at: at + offset * 60_000, choice: "PHNL", map: false, chapter: "pressure" },
  },
});

describe("kept station readings", () => {
  it("inherits legacy notes and views without losing their held positions", () => {
    const legacy = { ...reading(), note: "A distant pulse." };
    const loaded = readLibrary(JSON.stringify({ version: 1, saved: [legacy], recent: [legacy] }));
    expect(loaded.version).toBe(2);
    expect(loaded.saved).toEqual([legacy]);
    expect(loaded.recent).toEqual([legacy]);
    expect(readLibrary(JSON.stringify(loaded))).toEqual(loaded);
  });

  it("keeps separate minutes and notes while deduplicating the same reading across projections", () => {
    let library = rememberVisit(emptyLibrary(), reading(0, "The crest."), "saved");
    library = rememberVisit(library, reading(1, "After the crest."), "saved");
    const mapped = reading(0, "The crest, on the map.");
    mapped.position.moment!.map = true;
    library = rememberVisit(library, mapped, "saved");
    expect(library.saved).toEqual([mapped, reading(1, "After the crest.")]);
    expect(readLibrary(JSON.stringify(library)).saved).toEqual(library.saved);
    library = rememberVisit(rememberVisit(library, reading(), "recent"), reading(1), "recent");
    expect(library.recent).toHaveLength(1);
  });

  it("restores only the removed reading and preserves newer edits to another reading", () => {
    const first = reading(),
      second = reading(1, "Newer note.");
    const current = rememberVisit(emptyLibrary(), second, "saved");
    const restored = restoreVisits(current, { list: "saved", items: [first] });
    expect(restored.saved).toEqual([second, first]);
    expect(restoreVisits(restored, { list: "saved", items: [reading(1, "Old note.")] }).saved).toEqual([
      second,
      first,
    ]);
    expect(new Set(restored.saved.map(savedVisitKey)).size).toBe(2);
  });

  it("refuses a new reading at capacity without evicting any saved evidence", () => {
    let library = emptyLibrary();
    for (let offset = 0; offset < MAX_SAVED_VISITS; offset++)
      library = rememberVisit(library, reading(offset), "saved");
    expect(library.saved).toHaveLength(MAX_SAVED_VISITS);
    expect(rememberVisit(library, reading(MAX_SAVED_VISITS), "saved")).toBe(library);
    expect(rememberVisit(library, reading(0, "Updated."), "saved").saved).toHaveLength(MAX_SAVED_VISITS);
    expect(restoreVisits(library, { list: "saved", items: [reading(MAX_SAVED_VISITS)] })).toBe(library);
  });

  it("keeps the serialization limit without turning a large collection into an empty one", () => {
    let library = emptyLibrary(),
      refused = false;
    for (let offset = 0; offset < MAX_SAVED_VISITS; offset++) {
      const candidate = reading(offset, "\\".repeat(280));
      candidate.position.moment!.chapter = "a".repeat(80);
      candidate.position.moment!.city = "b".repeat(80);
      const next = rememberVisit(library, candidate, "saved");
      refused ||= next === library;
      library = next;
    }
    expect(refused).toBe(true);
    expect(library.saved.length).toBeGreaterThan(1);
    expect(JSON.stringify(library).length).toBeLessThanOrEqual(LIBRARY_MAX_LENGTH);
    expect(readLibrary(JSON.stringify(library)).saved).toEqual(library.saved);
  });
});
