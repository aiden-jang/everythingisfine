import { expect, it } from "vitest";
import {
  ANTIPODE,
  DURATION,
  END,
  ERUPTION,
  START,
  WAVE_ORIGIN,
  infrared,
  latestScan,
  layersAt,
  minuteAt,
  pressureAt,
  stationAt,
  stations,
  vapor,
  waveAngle,
  waveOrigin,
  wavePoint,
} from "./tongaTimeline";

it("uses the corresponding GOES scan and keeps unavailable frames off the timeline", () => {
  expect(infrared[latestScan(infrared, ERUPTION)]?.at).toBe("2022-01-15T04:20:32.0Z");
  expect(vapor[latestScan(vapor, 325)]?.minute).toBe(320);
  expect(layersAt(START, false, true, false)).toEqual({ orbitMix: 1, vaporMix: 0 });
  expect(layersAt(320, false, true, true)).toEqual({ orbitMix: 0, vaporMix: 1 });
  expect(layersAt(540, true, true, true).orbitMix).toBe(1);
});

it("preserves the ASOS measurements and leaves time outside each station window empty", () => {
  expect(stations.map((station) => station.values[station.peak - station.start])).toEqual([
    30054, 30202, 29452,
  ]);
  expect(pressureAt(stationAt(539), 539)).toBeCloseTo(1017.75, 2);
  expect(pressureAt(stationAt(723), 723)).toBeCloseTo(1022.76, 2);
  expect(stationAt(771).id).toBe("PANC");
  expect(pressureAt(stationAt(START), START)).toBeNull();
});

it("runs from the opening scan to the far side of Earth on the same UTC clock", () => {
  expect(minuteAt(0, false)).toBe(START);
  expect(minuteAt(DURATION, false)).toBe(END);
  expect(waveAngle(WAVE_ORIGIN)).toBe(0);
  expect(waveAngle(ANTIPODE)).toBe(Math.PI);
  const opposite = wavePoint(Math.PI, 0);
  for (let i = 0; i < opposite.length; i++) expect(opposite[i]).toBeCloseTo(-waveOrigin[i]!, 12);
});
