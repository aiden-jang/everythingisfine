import { describe, expect, it } from "vitest";
import { createFloatPlayback } from "../app/float/floatPlayback";
import { argoCatalogue, argoProfile, argoStation, depthFromPressure } from "./argo";

const time = "2026-10-30T12:24:00Z";
const row = ["6901932", 269, time, 59.92957, -48.718805, "A", "A"];
const table = (rows: unknown[][]) => ({ table: { rows } });

describe("Argo ascent readings", () => {
  it("keeps distinct good catalogue entries at or before the current time", () => {
    const future = ["6901932", 270, "2026-11-09T00:00:00Z", 60, -48, "A", "A"];
    const badSalinity = ["6901937", 266, time, 60, -48, "R", "F"];
    expect(argoCatalogue(table([future, row, row, badSalinity]), Date.parse(time))).toEqual([
      argoStation(row),
    ]);
  });

  it("uses adjusted data in A mode and screens all three quality flags at each depth", () => {
    const readings = Array.from({ length: 9 }, (_, index) => [
      150 * index,
      1,
      30,
      "1",
      "1",
      "1",
      150 * index,
      12 - index,
      34 + index / 10,
      "1",
      "2",
      index === 4 ? "4" : "1",
    ]);
    const profile = argoProfile(argoStation(row)!, table(readings))!;
    expect(profile.samples.map(({ pressure }) => pressure)).toEqual([1200, 1050, 900, 750, 450, 300, 150, 0]);
    expect(profile.samples[0]).toMatchObject({ temperature: 4, salinity: 34.8 });
    const raw = argoProfile(argoStation([...row.slice(0, 5), "R"])!, table(readings))!;
    expect(raw.samples).toHaveLength(9);
    expect(raw.samples[0]).toMatchObject({ temperature: 1, salinity: 30 });
    expect(argoProfile(argoStation(row)!, table(readings.slice(0, 7)))).toBeNull();
  });

  it("converts pressure to approximate depth and stops playback on a measured sample", () => {
    expect(depthFromPressure(1000, 30)).toBeCloseTo(990.81, 1);
    const profile = argoProfile(
      argoStation([...row.slice(0, 5), "R"])!,
      table(Array.from({ length: 11 }, (_, i) => [i * 100, 18 - i, 33 + i / 10, "1", "1", "1"])),
    )!;
    const playback = createFloatPlayback(profile, true, "recent");
    playback.step(4);
    expect(playback.read().index).toBe(3);
    playback.seek(6);
    expect(playback.read()).toEqual({ index: 6, playing: false });
    expect(playback.depth()).toBe(profile.samples[6]!.depth);
    playback.toggle();
    expect(playback.step(12)).toBe(false);
    expect(playback.read()).toEqual({ index: 10, playing: false });
  });
});
