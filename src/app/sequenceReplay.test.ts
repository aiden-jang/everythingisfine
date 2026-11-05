import { describe, expect, it } from "vitest";
import { createStore } from "../data/store";
import type { Filters, Reading } from "../data/types";
import { findNearby } from "./nearby";
import { createSequenceRun } from "./sequenceReplay";

const NOW = 1_700_000_000_000;
const filters: Filters = { minMagnitude: 2, windowMs: 3_600_000, sources: new Set(["usgs"]) };
function fixture() {
  const store = createStore(20);
  const add = (id: string, lon: number, time: number) =>
    store.ingest({
      id,
      lon,
      lat: 38,
      time,
      receivedAt: NOW,
      magnitude: 4.5,
      scale: "mww",
      depthKm: 12,
      place: "Honshu",
      source: "usgs",
      kind: "earthquake",
    } satisfies Reading).quake;
  add("late", 141.6, NOW - 20_000);
  const pin = add("pin", 141, NOW - 50_000);
  add("early", 140.6, NOW - 110_000);
  add("same-time", 141.3, NOW - 50_000);
  add("outside", 150, NOW - 50_000);
  return createSequenceRun(pin, findNearby(store, pin, filters, NOW), store, "thermal")!;
}

describe("sequence replay", () => {
  it("keeps the selected neighbourhood in recorded order and reveals ties together", () => {
    const run = fixture();
    expect(run.events.map(({ reading }) => reading.time - run.pin.time)).toEqual([-60_000, 0, 0, 30_000]);
    expect(run.step(0, false).shown).toBe(0);
    run.seek(run.pin.time);
    expect(run.step(1, false)).toMatchObject({ shown: 3, moving: false });
    expect(run.read()).toMatchObject({ at: run.pin.time, playing: false });
  });

  it("holds on the pin during playback before progressing into later events", () => {
    const run = fixture();
    const cue = run.events.find(({ pinned }) => pinned)!.cue;
    run.step(cue + 0.4, false);
    expect(run.read().at).toBe(run.pin.time);
    expect(run.step(0, false).shown).toBe(3);
    run.step(8, false);
    expect(run.read()).toMatchObject({ at: run.last, shown: 4, done: true, playing: false });
    run.toggle();
    expect(run.read()).toMatchObject({ at: run.first, shown: 1, done: false, playing: true });
  });

  it("shows the finished composition under reduced motion and keeps scrubbing still", () => {
    const run = fixture();
    expect(run.step(0, true)).toMatchObject({ shown: 4, approach: 1, moving: false });
    run.seek(run.first);
    expect(run.step(2, true)).toMatchObject({ shown: 1, approach: 1, moving: false });
    expect(run.read().at).toBe(run.first);
  });
});
