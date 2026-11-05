import { expect, it } from "vitest";
import {
  COAST_COMPARISON,
  FLIGHT_DURATION,
  LAST,
  OCEAN_ENTRY,
  SURVEY_STEP,
  bayCamera,
  lavaFrame,
  mapDate,
  overflight,
  snapshots,
  surveyCamera,
} from "./lavaTimeline";

it("keeps the ocean report separate from the first mapped land addition", () => {
  expect(mapDate(snapshots[0]!.at)).toBe("May 28 · 07:00 HST");
  expect(snapshots.slice(0, OCEAN_ENTRY).every((map) => map.delta.length === 0)).toBe(true);
  expect(mapDate(snapshots[OCEAN_ENTRY]!.at)).toBe("Jun 4 · 22:00 HST");
  expect(snapshots[OCEAN_ENTRY]!.delta.length).toBeGreaterThan(0);
  expect(mapDate(snapshots[LAST]!.at)).toBe("Aug 9 · 01:00 HST");
});

it("holds the ocean-entry map during the dated footage, then settles at the comparison", () => {
  expect(lavaFrame(0).index).toBe(0);
  const clip = lavaFrame(17_800);
  expect(clip.index).toBe(OCEAN_ENTRY);
  expect(clip.footage!.index).toBeLessThan(overflight.count);
  expect(lavaFrame(FLIGHT_DURATION)).toMatchObject({
    index: LAST,
    camera: bayCamera,
    wipe: COAST_COMPARISON,
    footage: null,
  });
});

it("uses fixed framing and discrete surveys when scrubbing", () => {
  const frame = lavaFrame(OCEAN_ENTRY * SURVEY_STEP, surveyCamera);
  expect(frame).toMatchObject({ index: OCEAN_ENTRY, camera: surveyCamera, footage: null, wipe: null });
});
