import { expect, test } from "vitest";
import { nearbyQuakes } from "./PlaceContext";
import { storyPlace } from "./places";
import { closestMeasurement } from "../observations/ObservationInspection";
import { comparableFrames } from "../observations/FrameComparison";
import { matchingMeasurements } from "../observations/PlaceComparison";
import type { Feed } from "../feed";
import type { Filters, Quake, Reading } from "../../data/types";

const now = Date.UTC(2026, 10, 12);
const hour = 3_600_000;
const filters: Filters = { minMagnitude: 2, windowMs: 24 * hour, sources: new Set(["usgs"]) };
const quake = (id: string, ago: number, lon = 141): Quake => {
  const primary: Reading = {
    id,
    source: "usgs",
    magnitude: 5,
    scale: "mww",
    depthKm: 20,
    lon,
    lat: 38,
    time: now - ago * hour,
    receivedAt: now,
    place: "Test location",
    kind: "earthquake",
  };
  return { key: id, primary, readings: [primary] };
};
test("a paused regional summary respects the window, cursor, source and distance independently", () => {
  const rows = [
    quake("too-old", 27),
    quake("recent", 9),
    quake("older", 20),
    quake("after-cursor", 1),
    quake("far", 10, -120),
  ];
  const feed = { store: { forEach: (read: (q: Quake) => void) => rows.forEach(read) } } as Pick<
    Feed,
    "store"
  >;
  const place = { lon: 141, lat: 38 };
  expect(nearbyQuakes(feed, filters, now - 6 * hour, now, place).map((q) => q.key)).toEqual([
    "recent",
    "older",
  ]);
  expect(nearbyQuakes(feed, { ...filters, sources: new Set() }, now, now, place)).toEqual([]);
  expect(nearbyQuakes(feed, { ...filters, minMagnitude: 6 }, now, now, place)).toEqual([]);
});
test("story previews use regional anchors without inventing a location for sky views", () => {
  for (const prefix of ["open-story-", "open-featured-", "search-story-", "overview-story-"])
    expect(storyPlace(`${prefix}tonga`)).toEqual({ lon: -175.4, lat: -20.55, label: "Hunga Tonga" });
  expect(storyPlace("open-tonight-sky")).toBeUndefined();
});
test("inspection returns a recorded monitor, never an interpolated value", () => {
  const marks = [
    { lon: 0, lat: 0, reading: { label: "Station A", value: "12.0 µg/m³" } },
    { lon: 0.1, lat: 0 },
  ];
  expect(closestMeasurement(marks, { lon: 0.1, lat: 0 })?.mark).toBe(marks[0]);
  expect(closestMeasurement(marks, { lon: 5, lat: 0 })).toBeNull();
  expect(closestMeasurement([], { lon: 0, lat: 0 })).toBeNull();
});
test("date comparisons exclude synthetic flight progress and plate reconstructions", () => {
  expect(comparableFrames([{ at: 0 }, { at: hour }])).toBe(true);
  expect(
    comparableFrames([
      { at: 0, timeLabel: "1984" },
      { at: hour, timeLabel: "2021" },
    ]),
  ).toBe(true);
  expect(comparableFrames([{ at: 0 }])).toBe(false);
  expect(comparableFrames([{ at: 0, timeLabel: "Start", sequence: true }, { at: hour }])).toBe(false);
  expect(comparableFrames([{ at: 0 }, { at: hour, reconstruction: true }])).toBe(false);
  expect(comparableFrames([{ at: 0 }, { at: 10 }])).toBe(false);
});
test("place comparisons do not substitute a similarly named measurement", () => {
  const a = {
    at: 0,
    measurements: [
      { label: "Water level", value: "0.4 m" },
      { label: "Prediction", value: "0.3 m" },
    ],
  };
  const b = {
    at: hour,
    measurements: [
      { label: "Water level", value: "0.6 m" },
      { label: "Predicted height", value: "0.5 m" },
    ],
  };
  expect(matchingMeasurements(a, b)).toEqual([{ label: "Water level", a: "0.4 m", b: "0.6 m" }]);
});
