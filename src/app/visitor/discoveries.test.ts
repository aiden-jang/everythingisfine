import { expect, it } from "vitest";
import { recentHighlight } from "./Discoveries";
import type { Stop } from "../tour";
const now = Date.UTC(2026, 10, 10, 12);
const stop: Stop = {
  name: "event",
  lon: 0,
  lat: 0,
  zoom: 1,
  count: 1,
  key: "usgs/1",
  reading: {
    source: "usgs",
    id: "1",
    time: now - 60_000,
    magnitude: 5.2,
    scale: "mww",
    place: "Fiji",
    lon: 0,
    lat: 0,
    depthKm: 10,
    kind: "earthquake",
    receivedAt: now,
  },
};
it("discovery keeps the provider magnitude scale, timestamp and ranking scope", () => {
  const result = recentHighlight(stop, now)!;
  expect(result.title).toContain("mww 5.2");
  expect(result.note).toContain("2026-11-10 11:59 UTC");
  expect(result.note).toContain("current filters");
});
it("discovery never advertises missing, future or expired earthquake readings as today", () => {
  expect(recentHighlight(null, now)).toBeNull();
  for (const time of [now + 1, now - 86_400_001])
    expect(recentHighlight({ ...stop, reading: { ...stop.reading!, time } }, now)).toBeNull();
});
