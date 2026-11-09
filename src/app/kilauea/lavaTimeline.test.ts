import { expect, it } from "vitest";
import { LAST, OCEAN_ENTRY, mapDate, snapshots } from "./lavaTimeline";

it("keeps the ocean report separate from the first mapped land addition", () => {
  expect(mapDate(snapshots[0]!.at)).toBe("May 28 · 07:00 HST");
  expect(snapshots.slice(0, OCEAN_ENTRY).every((map) => map.delta.length === 0)).toBe(true);
  expect(mapDate(snapshots[OCEAN_ENTRY]!.at)).toBe("Jun 4 · 22:00 HST");
  expect(snapshots[OCEAN_ENTRY]!.delta.length).toBeGreaterThan(0);
  expect(mapDate(snapshots[LAST]!.at)).toBe("Aug 9 · 01:00 HST");
});
